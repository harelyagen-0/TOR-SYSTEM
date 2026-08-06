/**
 * Cloud Functions entry point. Money/entitlement/booking/subscription effects
 * are now driven by CALLABLES (see payments.ts, booking.ts, subscriptions.ts,
 * customers.ts, admin.ts, entitlements.ts) so each has exactly one writer and a
 * single transactional path — the old at-least-once onPaymentWritten trigger,
 * which double-counted stats and could double-issue invoice numbers, is gone.
 *
 * What remains here as triggers/schedules: expense→ledger, recurrence
 * materialisation, entitlement expiry, subscription billing, and the monthly
 * accountant report (now immutable + versioned). All money is integer agorot.
 */
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import {
  addDaysKey, dateKeyOf, monthKeyOf, splitVatInclusive, tenantConfig,
  tzParts, zonedTimeToUtc,
} from './lib.js'
import { messageSenderFor } from './providers.js'
import { expireStalePayments } from './payments.js'

initializeApp()
const db = getFirestore()

// ── expenses → ledger ───────────────────────────────────────────────────────
export const onExpenseCreated = onDocumentCreated(
  'tenants/{tenantId}/expenses/{expenseId}',
  async (event) => {
    const { tenantId, expenseId } = event.params
    const data = event.data?.data()
    if (!data) return
    const { tz, vat } = await tenantConfig(tenantId)
    const gross = Math.abs(data.amount as number)
    // expenses carry recoverable input VAT when the studio is VAT-registered
    const split = splitVatInclusive(gross, vat)
    await db.collection(`tenants/${tenantId}/ledger`).doc(`led_${expenseId}`).set({
      kind: 'expense', amount: -gross,
      netAgorot: -split.netAgorot, vatAgorot: -split.vatAgorot, vatRate: split.vatRate,
      description: data.name ?? '', refId: expenseId, invoiceId: null,
      period: monthKeyOf((data.date as Timestamp)?.toDate() ?? new Date(), tz),
      createdAt: FieldValue.serverTimestamp(),
    })
  },
)

// ── recurrence materialisation (rolling 12-week horizon) ────────────────────
export async function materialiseTenantSessions(tenantId: string): Promise<number> {
  const { tz } = await tenantConfig(tenantId)
  const todayKey = dateKeyOf(new Date(), tz)
  const horizonEnd = addDaysKey(todayKey, 12 * 7)

  const [recSnap, tplSnap] = await Promise.all([
    db.collection(`tenants/${tenantId}/recurrences`).get(),
    db.collection(`tenants/${tenantId}/classTemplates`).get(),
  ])
  const templates = new Map(tplSnap.docs.map((d) => [d.id, d.data()]))
  let created = 0

  for (const recDoc of recSnap.docs) {
    const rec = recDoc.data()
    const tpl = templates.get(rec.templateId as string)
    if (!tpl) {
      logger.warn(`recurrence ${tenantId}/${recDoc.id} references missing template ${rec.templateId}`)
      continue
    }
    const exceptions = new Set((rec.exceptions as string[]) ?? [])

    for (let ymd = todayKey; ymd <= horizonEnd; ymd = addDaysKey(ymd, 1)) {
      if (rec.startsOn && ymd < rec.startsOn) continue
      if (rec.endsOn && ymd > rec.endsOn) break
      const wd = tzParts(zonedTimeToUtc(ymd, '12:00', tz), tz).weekday
      if (wd !== rec.weekday) continue
      if (exceptions.has(ymd)) continue

      const sessionId = `${recDoc.id}_${ymd}`
      const ref = db.doc(`tenants/${tenantId}/sessions/${sessionId}`)
      if ((await ref.get()).exists) continue

      const startAt = zonedTimeToUtc(ymd, rec.time as string, tz)
      const endAt = new Date(startAt.getTime() + (tpl.durationMinutes as number) * 60_000)
      await ref.set({
        templateId: rec.templateId, recurrenceId: recDoc.id, occurrenceDate: ymd,
        title: tpl.title, classTypeId: tpl.classTypeId,
        instructorId: tpl.defaultInstructorId ?? null,
        startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt),
        capacity: tpl.capacity, price: tpl.price,
        registeredCount: 0, status: 'scheduled',
      })
      created++
    }
  }
  return created
}

export const materialiseSessions = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Asia/Jerusalem' },
  async () => {
    const tenants = await db.collection('tenants').get()
    for (const t of tenants.docs) {
      const created = await materialiseTenantSessions(t.id)
      await expireStalePayments(t.id)
      logger.info(`materialised ${created} sessions for ${t.id}`)
    }
  },
)

// ── monthly accountant report (immutable + versioned — P1-9) ─────────────────
async function generateReportData(tenantId: string, period: string) {
  const lines = await db.collection(`tenants/${tenantId}/ledger`).where('period', '==', period).get()
  let income = 0, expenses = 0, refunds = 0, vatCollected = 0
  let cursor: Timestamp | null = null
  const lineItems = lines.docs.map((d) => {
    const l = d.data()
    const created = l.createdAt as Timestamp | undefined
    if (created && (!cursor || created.toMillis() > cursor.toMillis())) cursor = created
    if (l.kind === 'payment') { income += l.amount; vatCollected += l.vatAgorot ?? 0 }
    else if (l.kind === 'expense') { expenses += -l.amount; vatCollected += l.vatAgorot ?? 0 }
    else if (l.kind === 'refund') { refunds += l.amount; vatCollected += l.vatAgorot ?? 0 }
    return l
  })
  return {
    totals: { income, expenses, refunds, net: income + refunds - expenses, vatCollected },
    lineItems, ledgerCursor: cursor,
  }
}

/** Compiles a NEW immutable version of the period's report and (re)sends it. */
async function compileReport(tenantId: string, period: string): Promise<void> {
  const data = await generateReportData(tenantId, period)
  const periodRef = db.doc(`tenants/${tenantId}/reports/${period}`)
  const prev = await periodRef.get()
  const version = ((prev.data()?.version as number) ?? 0) + 1
  const payload = { period, ...data, version, fileUrl: null as string | null, sentAt: FieldValue.serverTimestamp() }
  await periodRef.set(payload)
  await db.doc(`tenants/${tenantId}/reports/${period}/versions/${version}`).set(payload)

  const { accountantEmail, raw } = await tenantConfig(tenantId)
  if (accountantEmail) {
    await messageSenderFor(raw).sendEmail(accountantEmail, `דוח חודשי ${period}`, 'הדוח החודשי מצורף.')
  }
}

/** Re-sends the EXISTING report version without recomputing (P1-9). */
async function resendExisting(tenantId: string, period: string): Promise<boolean> {
  const snap = await db.doc(`tenants/${tenantId}/reports/${period}`).get()
  if (!snap.exists) return false
  await snap.ref.update({ sentAt: FieldValue.serverTimestamp() })
  const { accountantEmail, raw } = await tenantConfig(tenantId)
  if (accountantEmail) {
    await messageSenderFor(raw).sendEmail(accountantEmail, `דוח חודשי ${period}`, 'הדוח החודשי (שליחה חוזרת).')
  }
  return true
}

const isPeriod = (p: unknown): p is string => typeof p === 'string' && /^\d{4}-\d{2}$/.test(p)

/** Re-send an existing report; if none exists yet, compile version 1. */
export const resendReport = onCall(async (request) => {
  const tenantId = request.auth?.token?.tenantId
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('permission-denied', 'no tenant claim')
  const period = (request.data as { period?: unknown })?.period
  if (!isPeriod(period)) throw new HttpsError('invalid-argument', 'bad period')
  const resent = await resendExisting(tenantId, period)
  if (!resent) await compileReport(tenantId, period)
  return { ok: true }
})

/** Explicitly compile a NEW version (e.g. after a late expense was entered). */
export const regenerateReport = onCall(async (request) => {
  const tenantId = request.auth?.token?.tenantId
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('permission-denied', 'no tenant claim')
  const period = (request.data as { period?: unknown })?.period
  if (!isPeriod(period)) throw new HttpsError('invalid-argument', 'bad period')
  await compileReport(tenantId, period)
  return { ok: true }
})

export const monthlyAccountantReport = onSchedule(
  { schedule: '0 6 1 * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15)
    const period = monthKeyOf(prev, 'Asia/Jerusalem')
    const tenants = await db.collection('tenants').get()
    for (const t of tenants.docs) {
      await compileReport(t.id, period)
      logger.info(`report ${period} compiled for ${t.id}`)
    }
  },
)

// ── re-export callables so Cloud Functions discovers them ───────────────────
export { createCustomer } from './customers.js'
export { createPayment, markPaymentPaid, refundPayment, growWebhook } from './payments.js'
export { bookCustomer, cancelBooking, markAttendance } from './booking.js'
export {
  chargeDueSubscriptions, pauseSubscription, resumeSubscription, cancelSubscription,
} from './subscriptions.js'
export { expireEntitlements, adjustEntitlement } from './entitlements.js'
export { provisionTenant, addOperator, removeOperator } from './admin.js'
