/**
 * Subscription billing engine (spec Q2 — token flow open, so the mock provider
 * charges). A daily job finds due active subscriptions and charges them; a
 * successful charge writes a payment (which cascades to invoice + ledger via
 * applyPaidPayment) and advances nextChargeAt. Failures dun and eventually
 * cancel. Pause records pausedAt; resume pushes nextChargeAt by the paused
 * duration so a paused month is never billed. Cancel stops at period end.
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { applyPaidPayment, audit, requireTenant, tenantConfig } from './lib.js'
import { paymentProviderFor } from './providers.js'

const db = getFirestore()
const MAX_DUNNING = 3

/** Charge every due active subscription for one tenant. Returns count charged. */
export async function chargeDueSubscriptionsForTenant(tenantId: string): Promise<number> {
  const { raw } = await tenantConfig(tenantId)
  const provider = paymentProviderFor(raw)
  const now = Timestamp.now()
  const due = await db.collection(`tenants/${tenantId}/subscriptions`)
    .where('status', '==', 'active').where('nextChargeAt', '<=', now).get()

  let charged = 0
  for (const doc of due.docs) {
    const sub = doc.data()
    const priceAgorot = sub.productSnapshot?.price ?? 0
    if (priceAgorot <= 0) continue
    try {
      const res = await provider.chargeRecurring(sub.growTokenRef ?? '', priceAgorot)
      if (res.status !== 'paid') throw new Error('charge failed')
      // record the recurring charge as a normal payment → invoice + ledger
      const payRef = db.collection(`tenants/${tenantId}/payments`).doc()
      await payRef.set({
        customerId: sub.customerId,
        walkInName: null,
        productId: sub.productId,
        productSnapshot: { name: sub.productSnapshot?.name ?? '', price: priceAgorot, kind: 'subscription' },
        items: [{ productId: sub.productId, name: sub.productSnapshot?.name ?? '', price: priceAgorot, kind: 'single', quantity: 1 }],
        amount: priceAgorot,
        method: 'card',
        status: 'paid',
        growTransactionId: res.transactionId,
        invoiceId: null,
        refundOfPaymentId: null,
        subscriptionId: doc.id,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'system:subscription',
      })
      await applyPaidPayment(tenantId, payRef.id)
      const next = new Date(Date.now() + (sub.intervalDays ?? 30) * 86400_000)
      await doc.ref.update({ nextChargeAt: Timestamp.fromDate(next), dunningCount: 0 })
      charged++
    } catch (err) {
      const dun = (sub.dunningCount ?? 0) + 1
      const cancel = dun >= MAX_DUNNING
      await doc.ref.update({
        status: cancel ? 'cancelled' : 'pastDue',
        dunningCount: dun,
        ...(cancel ? { endsAt: FieldValue.serverTimestamp() } : {}),
      })
      logger.error(`subscription ${tenantId}/${doc.id} charge failed (dun ${dun})`, err)
    }
  }
  return charged
}

export const chargeDueSubscriptions = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Asia/Jerusalem' },
  async () => {
    const tenants = await db.collection('tenants').get()
    for (const t of tenants.docs) {
      const n = await chargeDueSubscriptionsForTenant(t.id)
      logger.info(`charged ${n} subscriptions for ${t.id}`)
    }
  },
)

export const pauseSubscription = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const { id } = request.data as { id: string }
  const ref = db.doc(`tenants/${tenantId}/subscriptions/${id}`)
  const sub = (await ref.get()).data()
  if (!sub) throw new HttpsError('not-found', 'subscription not found')
  if (sub.status !== 'active') throw new HttpsError('failed-precondition', 'not active')
  await ref.update({ status: 'paused', pausedAt: FieldValue.serverTimestamp() })
  await audit(tenantId, request.auth!.uid, 'subscription.pause', id)
  return { ok: true }
})

export const resumeSubscription = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const { id } = request.data as { id: string }
  const ref = db.doc(`tenants/${tenantId}/subscriptions/${id}`)
  const sub = (await ref.get()).data()
  if (!sub) throw new HttpsError('not-found', 'subscription not found')
  if (sub.status !== 'paused') throw new HttpsError('failed-precondition', 'not paused')
  // push nextChargeAt forward by however long it was paused, so the paused
  // period is never billed.
  const pausedMs = sub.pausedAt ? Date.now() - (sub.pausedAt as Timestamp).toMillis() : 0
  const nextMs = (sub.nextChargeAt as Timestamp).toMillis() + pausedMs
  await ref.update({ status: 'active', pausedAt: null, nextChargeAt: Timestamp.fromMillis(nextMs) })
  await audit(tenantId, request.auth!.uid, 'subscription.resume', id)
  return { ok: true }
})

export const cancelSubscription = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const { id, immediate } = request.data as { id: string; immediate?: boolean }
  const ref = db.doc(`tenants/${tenantId}/subscriptions/${id}`)
  const sub = (await ref.get()).data()
  if (!sub) throw new HttpsError('not-found', 'subscription not found')
  // by default the customer keeps access until the paid period ends.
  const endsAt = immediate ? Timestamp.now() : (sub.nextChargeAt as Timestamp)
  await ref.update({ status: 'cancelled', endsAt })
  await audit(tenantId, request.auth!.uid, 'subscription.cancel', id, { immediate: !!immediate })
  return { ok: true }
})
