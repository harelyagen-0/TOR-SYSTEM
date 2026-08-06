/**
 * Payment lifecycle, server-side. Pricing, promo validation/consumption,
 * invoice numbering and entitlement grants all happen here — the client never
 * writes a payment doc. This is the fix for P1-1..P1-5, P1-11 and P0-4:
 *   • prices come from the product docs, never the request
 *   • the promo is re-validated and consumed in the SAME transaction as the
 *     payment write (no oversell, no lost decrement)
 *   • invoice numbering is transactional + idempotent (applyPaidPayment)
 *   • refunds actually call the provider, reverse entitlements/subs/stats/promo
 *     and support partial amounts
 *   • a Grow webhook (and a manual mark-paid) flips a pending link payment.
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import {
  applyPaidPayment, audit, monthKeyOf, requireTenant, splitVatInclusive, tenantConfig, yearKeyOf,
  allocateInvoiceInTx,
} from './lib.js'
import { paymentProviderFor } from './providers.js'
import { allocateCustomer, normalisePhone, type NewCustomer } from './customers.js'

const db = getFirestore()

// ── input types ───────────────────────────────────────────────────────────--
type Method = 'card' | 'cash' | 'other'
interface CreatePaymentInput {
  customerId?: string
  newCustomer?: NewCustomer
  walkInName?: string
  who: 'existing' | 'new' | 'walkIn'
  items: { productId: string; quantity: number }[]
  promoCode?: string
  method: Method
  cardMode?: 'charge' | 'link'
  otherMethodLabel?: string
}

// ── createPayment ────────────────────────────────────────────────────────────
export const createPayment = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const uid = request.auth!.uid
  const input = request.data as CreatePaymentInput
  if (!Array.isArray(input?.items) || input.items.length === 0) {
    throw new HttpsError('invalid-argument', 'items required')
  }
  const { vat, raw } = await tenantConfig(tenantId)

  // 1 · price every line from the PRODUCT doc (never the client)
  const lines: { productId: string; name: string; price: number; kind: string; quantity: number }[] = []
  for (const it of input.items) {
    const q = Math.max(1, Math.floor(Number(it.quantity) || 0))
    const prod = (await db.doc(`tenants/${tenantId}/products/${it.productId}`).get()).data()
    if (!prod || prod.active === false) throw new HttpsError('failed-precondition', `product ${it.productId} unavailable`)
    lines.push({ productId: it.productId, name: prod.name, price: prod.price, kind: prod.kind, quantity: q })
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0)

  // 2 · resolve + validate the promo server-side (consumed transactionally below)
  let discount = 0
  let promoRef: FirebaseFirestore.DocumentReference | null = null
  if (input.promoCode?.trim()) {
    const snap = await db.collection(`tenants/${tenantId}/promoCodes`)
      .where('code', '==', input.promoCode.trim().toUpperCase()).limit(1).get()
    const doc = snap.docs[0]
    if (!doc || doc.data().active !== true) throw new HttpsError('failed-precondition', 'promo-invalid')
    const p = doc.data()
    if (p.validUntil && (p.validUntil as Timestamp).toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'promo-expired')
    if (p.usageLimit != null && (p.usedCount ?? 0) >= p.usageLimit) throw new HttpsError('failed-precondition', 'promo-used-up')
    const audienceOk = p.audience === 'all'
      || (p.audience === 'new' && input.who === 'new')
      || (p.audience === 'existing' && input.who === 'existing')
    if (!audienceOk) throw new HttpsError('failed-precondition', 'promo-audience')
    const restricted = Array.isArray(p.productIds) && p.productIds.length > 0
    const eligible = restricted ? lines.filter((l) => p.productIds.includes(l.productId)) : lines
    const eligibleSubtotal = eligible.reduce((s, l) => s + l.price * l.quantity, 0)
    if (restricted && eligibleSubtotal === 0) throw new HttpsError('failed-precondition', 'promo-product')
    discount = p.discountKind === 'percent'
      ? Math.round(eligibleSubtotal * (p.value / 100))
      : Math.min(p.value, eligibleSubtotal)
    promoRef = doc.ref
  }

  const gross = Math.max(0, subtotal - discount)
  const split = splitVatInclusive(gross, vat)
  const pricing = {
    subtotalAgorot: subtotal, discountAgorot: discount, grossAgorot: gross,
    netAgorot: split.netAgorot, vatAgorot: split.vatAgorot, vatRate: split.vatRate,
  }

  // 3 · resolve the customer (create the new one here, atomically-ish)
  let customerId = input.customerId
  if (input.who === 'new' && input.newCustomer) {
    const created = await allocateCustomer(tenantId, input.newCustomer)
    customerId = created.id
  }

  // 4 · charge the card server-side BEFORE writing a paid payment
  const provider = paymentProviderFor(raw)
  let status: 'pending' | 'paid' = 'paid'
  let growTransactionId: string | null = null
  let paymentUrl: string | null = null
  const description = lines.map((l) => (l.quantity > 1 ? `${l.name} ×${l.quantity}` : l.name)).join(', ')
  if (input.method === 'card') {
    if (input.cardMode === 'link') {
      const res = await provider.createPaymentLink(gross, description)
      growTransactionId = res.transactionId
      paymentUrl = res.url
      status = 'pending' // paid only when the customer completes the Grow form (webhook)
    } else {
      const res = await provider.charge(gross, description)
      if (res.status !== 'paid') throw new HttpsError('failed-precondition', 'payment-failed', { reason: 'payment-failed' })
      growTransactionId = res.transactionId
    }
  }

  // 5 · write the payment + consume the promo in ONE transaction (oversell guard)
  const paymentRef = db.collection(`tenants/${tenantId}/payments`).doc()
  await db.runTransaction(async (tx) => {
    if (promoRef) {
      const fresh = await tx.get(promoRef)
      const pd = fresh.data()
      if (!pd || pd.active !== true) throw new HttpsError('failed-precondition', 'promo-invalid')
      if (pd.usageLimit != null && (pd.usedCount ?? 0) >= pd.usageLimit) throw new HttpsError('failed-precondition', 'promo-used-up')
      tx.update(promoRef, { usedCount: FieldValue.increment(1) })
    }
    tx.set(paymentRef, {
      customerId: customerId ?? null,
      walkInName: input.who === 'walkIn' ? (input.walkInName?.trim() ?? null) : null,
      productId: lines[0].productId,
      productSnapshot: { name: lines[0].name, price: lines[0].price, kind: lines[0].kind },
      items: lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, kind: l.kind, quantity: l.quantity })),
      amount: gross,
      pricing,
      refundedAmount: 0,
      promoCodeId: promoRef?.id ?? null,
      method: input.method,
      otherMethodLabel: input.method === 'other' ? (input.otherMethodLabel?.trim() ?? null) : null,
      status,
      growTransactionId,
      invoiceId: null,
      refundOfPaymentId: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    })
  })

  // 6 · if already paid, issue invoice + ledger + entitlements now (idempotent)
  if (status === 'paid') await applyPaidPayment(tenantId, paymentRef.id)
  await audit(tenantId, uid, 'payment.create', paymentRef.id, { amount: gross, status })

  const after = (await paymentRef.get()).data()
  return { paymentId: paymentRef.id, invoiceId: after?.invoiceId ?? null, status, paymentUrl, customerId: customerId ?? null }
})

// ── markPaymentPaid (manual reconciliation for pending link/cash) ─────────────
export const markPaymentPaid = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const { paymentId } = request.data as { paymentId: string }
  if (!paymentId) throw new HttpsError('invalid-argument', 'paymentId required')
  const ref = db.doc(`tenants/${tenantId}/payments/${paymentId}`)
  const snap = await ref.get()
  const pay = snap.data()
  if (!pay) throw new HttpsError('not-found', 'payment not found')
  if (pay.status === 'paid') return { ok: true, already: true }
  if (pay.status === 'refunded') throw new HttpsError('failed-precondition', 'payment refunded')
  await ref.update({ status: 'paid' })
  await applyPaidPayment(tenantId, paymentId)
  await audit(tenantId, request.auth!.uid, 'payment.markPaid', paymentId)
  return { ok: true }
})

// ── refundPayment (real provider refund + full reversal, partial supported) ──
export const refundPayment = onCall(async (request) => {
  const tenantId = requireTenant(request)
  const uid = request.auth!.uid
  const { paymentId, amount, reason } = request.data as { paymentId: string; amount?: number; reason?: string }
  if (!paymentId) throw new HttpsError('invalid-argument', 'paymentId required')
  const { tz, vat, raw } = await tenantConfig(tenantId)

  const origRef = db.doc(`tenants/${tenantId}/payments/${paymentId}`)
  const origSnap = await origRef.get()
  const orig = origSnap.data()
  if (!orig) throw new HttpsError('not-found', 'payment not found')
  if (orig.status !== 'paid') throw new HttpsError('failed-precondition', 'only a paid payment can be refunded')
  const alreadyRefunded = (orig.refundedAmount as number) ?? 0
  const remaining = (orig.amount as number) - alreadyRefunded
  const refundAmt = amount != null ? Math.min(Math.abs(Math.round(amount)), remaining) : remaining
  if (refundAmt <= 0) throw new HttpsError('failed-precondition', 'nothing left to refund')

  // 1 · actually refund the card (mock always ok)
  const provider = paymentProviderFor(raw)
  if (orig.growTransactionId) {
    const res = await provider.refund(orig.growTransactionId as string, refundAmt)
    if (!res.ok) throw new HttpsError('failed-precondition', 'provider refund failed', { reason: 'payment-failed' })
  }

  const year = yearKeyOf(new Date(), tz)
  const period = monthKeyOf(new Date(), tz)
  const refundRef = db.collection(`tenants/${tenantId}/payments`).doc()
  const fullRefund = refundAmt >= remaining

  await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(db.doc(`tenants/${tenantId}/counters/invoices_${year}`))
    // credit invoice + negative ledger line with proportional VAT
    const { invoiceId } = allocateInvoiceInTx(tx, tenantId, year, counterSnap, refundRef.id, -refundAmt, 'creditInvoice')
    const split = splitVatInclusive(refundAmt, vat)
    tx.set(refundRef, {
      customerId: orig.customerId ?? null,
      walkInName: orig.walkInName ?? null,
      productId: orig.productId,
      productSnapshot: orig.productSnapshot,
      amount: -refundAmt,
      pricing: { subtotalAgorot: -refundAmt, discountAgorot: 0, grossAgorot: -refundAmt, netAgorot: -split.netAgorot, vatAgorot: -split.vatAgorot, vatRate: split.vatRate },
      method: orig.method,
      otherMethodLabel: orig.otherMethodLabel ?? null,
      status: 'refunded',
      growTransactionId: null,
      invoiceId,
      refundOfPaymentId: paymentId,
      reason: reason ?? null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    })
    tx.set(db.doc(`tenants/${tenantId}/ledger/led_${refundRef.id}`), {
      kind: 'refund', amount: -refundAmt,
      netAgorot: -split.netAgorot, vatAgorot: -split.vatAgorot, vatRate: split.vatRate,
      description: `זיכוי — ${orig.productSnapshot?.name ?? ''}`,
      refId: refundRef.id, invoiceId, period, originalPeriod: orig.createdAt ? monthKeyOf((orig.createdAt as Timestamp).toDate(), tz) : period,
      createdAt: FieldValue.serverTimestamp(),
    })
    // reverse the original: mark refunded (fully) + accumulate refundedAmount
    tx.update(origRef, {
      refundedAmount: alreadyRefunded + refundAmt,
      status: fullRefund ? 'refunded' : 'paid',
    })
    // reverse customer stats
    if (orig.customerId) {
      tx.update(db.doc(`tenants/${tenantId}/customers/${orig.customerId}`), {
        'stats.totalSpent': FieldValue.increment(-refundAmt),
      })
    }
    // decrement the promo it consumed (full refunds only)
    if (fullRefund && orig.promoCodeId) {
      tx.update(db.doc(`tenants/${tenantId}/promoCodes/${orig.promoCodeId}`), {
        usedCount: FieldValue.increment(-1),
      })
    }
  })

  // revoke the entitlements / subscriptions the original granted (full refund)
  if (fullRefund) {
    const ents = await db.collection(`tenants/${tenantId}/entitlements`).where('sourcePaymentId', '==', paymentId).get()
    const subs = await db.collection(`tenants/${tenantId}/subscriptions`).where('sourcePaymentId', '==', paymentId).get()
    const batch = db.batch()
    ents.forEach((d) => batch.update(d.ref, { status: 'expired', revokedAt: FieldValue.serverTimestamp() }))
    subs.forEach((d) => batch.update(d.ref, { status: 'cancelled', endsAt: FieldValue.serverTimestamp() }))
    await batch.commit()
  }

  await audit(tenantId, uid, 'payment.refund', paymentId, { refundAmt, fullRefund })
  return { ok: true, refundId: refundRef.id, refundAmt, fullRefund }
})

// ── Grow webhook: flips a pending link payment to paid ───────────────────────
export const growWebhook = onRequest(async (req, res) => {
  // [OPEN spec Q2] verify Grow's signature here before trusting the body.
  const { tenantId, transactionId, status } = req.body ?? {}
  if (!tenantId || !transactionId) { res.status(400).send('bad request'); return }
  const snap = await db.collection(`tenants/${tenantId}/payments`)
    .where('growTransactionId', '==', transactionId).limit(1).get()
  const doc = snap.docs[0]
  if (!doc) { res.status(404).send('unknown transaction'); return }
  if (status === 'paid' && doc.data().status === 'pending') {
    await doc.ref.update({ status: 'paid' })
    await applyPaidPayment(tenantId, doc.id)
  } else if (status === 'failed' && doc.data().status === 'pending') {
    await doc.ref.update({ status: 'failed' })
  }
  logger.info(`grow webhook ${tenantId}/${doc.id} → ${status}`)
  res.status(200).send('ok')
})

// ── sweep stale pending link payments → expired (nightly) ────────────────────
export async function expireStalePayments(tenantId: string, olderThanDays = 3): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - olderThanDays * 86400_000)
  const snap = await db.collection(`tenants/${tenantId}/payments`)
    .where('status', '==', 'pending').where('createdAt', '<', cutoff).get()
  const batch = db.batch()
  snap.forEach((d) => batch.update(d.ref, { status: 'failed', expiredBySweep: true }))
  if (!snap.empty) await batch.commit()
  return snap.size
}

export { normalisePhone }
