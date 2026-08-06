/**
 * Booking + attendance (spec Q5, now decided).
 *
 * Coverage is resolved at BOOKING time, in priority order:
 *   1. an active subscription that grants entry to this class's template
 *   2. a punch card with remaining > 0 (respecting the template's allowed
 *      products) — one punch is deducted now
 *   3. a single paid entry (cash/card/other) taken at the door
 * The registration records how it was covered; the seat and any entitlement
 * decrement happen in one transaction with a capacity guard. A deterministic
 * registration id (`reg_<session>_<customer>`) makes double-booking impossible.
 *
 * markAttendance stamps attendedAt and moves customer stats — punches are NOT
 * re-deducted at attendance (they were consumed at booking).
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { audit, requireTenant } from './lib.js'

const db = getFirestore()

type SingleMethod = 'cash' | 'card' | 'other'
interface BookInput {
  sessionId: string
  customerId: string
  /** for the pay-at-door single-entry path, when no pass/subscription covers it */
  singleMethod?: SingleMethod
  otherMethodLabel?: string
}

export const bookCustomer = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const uid = request.auth!.uid
  const { sessionId, customerId, singleMethod, otherMethodLabel } = request.data as BookInput
  if (!sessionId || !customerId) throw new HttpsError('invalid-argument', 'sessionId and customerId required')

  const sessionRef = db.doc(`tenants/${tenantId}/sessions/${sessionId}`)
  const regRef = db.doc(`tenants/${tenantId}/registrations/reg_${sessionId}_${customerId}`)

  // find candidate coverage OUTSIDE the transaction (queries aren't allowed in one)
  const session = (await sessionRef.get()).data()
  if (!session) throw new HttpsError('not-found', 'session not found')
  const template = session.templateId
    ? (await db.doc(`tenants/${tenantId}/classTemplates/${session.templateId}`).get()).data()
    : null
  const allowed: string[] | null = template?.allowedProductIds ?? null
  const grants = (productId: string) => allowed === null || allowed.includes(productId)

  const subs = await db.collection(`tenants/${tenantId}/subscriptions`)
    .where('customerId', '==', customerId).where('status', '==', 'active').get()
  const coveringSub = subs.docs.find((d) => grants(d.data().productId))

  const ents = await db.collection(`tenants/${tenantId}/entitlements`)
    .where('customerId', '==', customerId).where('status', '==', 'active').get()
  const coveringPunch = ents.docs.find((d) => {
    const e = d.data()
    return e.kind === 'punchCard' && (e.remaining ?? 0) > 0 && grants(e.productId)
      && (!e.expiresAt || (e.expiresAt as Timestamp).toMillis() > Date.now())
  })

  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(sessionRef)
    const s = sSnap.data()
    if (!s) throw new HttpsError('not-found', 'session not found')
    if (s.status !== 'scheduled') throw new HttpsError('failed-precondition', 'session not open')
    const existing = await tx.get(regRef)
    if (existing.exists && existing.data()?.status !== 'cancelled') {
      throw new HttpsError('already-exists', 'already booked')
    }
    if ((s.registeredCount ?? 0) >= s.capacity) throw new HttpsError('failed-precondition', 'session full')

    let coverage: Record<string, unknown>
    let sourceEntitlementId: string | null = null
    if (coveringSub) {
      coverage = { kind: 'subscription' }
    } else if (coveringPunch) {
      const eSnap = await tx.get(coveringPunch.ref)
      const remaining = (eSnap.data()?.remaining ?? 0) as number
      if (remaining <= 0) throw new HttpsError('failed-precondition', 'punch card empty')
      tx.update(coveringPunch.ref, {
        remaining: remaining - 1,
        status: remaining - 1 <= 0 ? 'used' : 'active',
      })
      coverage = { kind: 'punchCard' }
      sourceEntitlementId = coveringPunch.id
    } else {
      if (!singleMethod) throw new HttpsError('failed-precondition', 'payment-required')
      coverage = { kind: 'single', method: singleMethod, otherMethodLabel: otherMethodLabel ?? null }
    }

    tx.set(regRef, {
      sessionId, customerId, status: 'booked', attendedAt: null, lateCancel: null,
      coverage, sourceEntitlementId, paymentId: null,
      createdAt: FieldValue.serverTimestamp(),
    })
    tx.update(sessionRef, { registeredCount: FieldValue.increment(1) })
  })

  await audit(tenantId, uid, 'booking.create', regRef.id)
  return { ok: true, registrationId: regRef.id }
})

interface CancelInput { registrationId: string; lateCancel?: boolean }
export const cancelBooking = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const { registrationId, lateCancel } = request.data as CancelInput
  if (!registrationId) throw new HttpsError('invalid-argument', 'registrationId required')
  const regRef = db.doc(`tenants/${tenantId}/registrations/${registrationId}`)

  await db.runTransaction(async (tx) => {
    const regSnap = await tx.get(regRef)
    const reg = regSnap.data()
    if (!reg) throw new HttpsError('not-found', 'registration not found')
    if (reg.status === 'cancelled') return
    const sessionRef = db.doc(`tenants/${tenantId}/sessions/${reg.sessionId}`)
    const sSnap = await tx.get(sessionRef)
    // refund the punch unless it's a late cancel the studio still charges for
    if (reg.coverage?.kind === 'punchCard' && reg.sourceEntitlementId && !lateCancel) {
      const entRef = db.doc(`tenants/${tenantId}/entitlements/${reg.sourceEntitlementId}`)
      const eSnap = await tx.get(entRef)
      if (eSnap.exists) {
        tx.update(entRef, { remaining: FieldValue.increment(1), status: 'active' })
      }
    }
    tx.update(regRef, { status: 'cancelled', lateCancel: !!lateCancel })
    if (sSnap.exists && (sSnap.data()?.registeredCount ?? 0) > 0) {
      tx.update(sessionRef, { registeredCount: FieldValue.increment(-1) })
    }
  })
  await audit(tenantId, request.auth!.uid, 'booking.cancel', registrationId, { lateCancel: !!lateCancel })
  return { ok: true }
})

type AttendanceStatus = 'booked' | 'attended' | 'noShow'
export const markAttendance = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const { registrationId, status } = request.data as { registrationId: string; status: AttendanceStatus }
  if (!registrationId || !status) throw new HttpsError('invalid-argument', 'registrationId and status required')
  const regRef = db.doc(`tenants/${tenantId}/registrations/${registrationId}`)

  await db.runTransaction(async (tx) => {
    const regSnap = await tx.get(regRef)
    const reg = regSnap.data()
    if (!reg) throw new HttpsError('not-found', 'registration not found')
    const wasAttended = reg.status === 'attended'
    const nowAttended = status === 'attended'
    tx.update(regRef, {
      status,
      attendedAt: nowAttended ? FieldValue.serverTimestamp() : null,
    })
    if (wasAttended !== nowAttended) {
      tx.update(db.doc(`tenants/${tenantId}/customers/${reg.customerId}`), {
        'stats.sessionsAttended': FieldValue.increment(nowAttended ? 1 : -1),
        ...(nowAttended ? { 'stats.lastVisitAt': FieldValue.serverTimestamp() } : {}),
      })
    }
  })
  await audit(tenantId, request.auth!.uid, 'attendance.mark', registrationId, { status })
  return { ok: true }
})
