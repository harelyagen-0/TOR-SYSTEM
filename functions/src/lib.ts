/**
 * Shared server helpers: timezone maths, money/VAT, invoice numbering, the
 * single idempotent "apply a paid payment" routine, and audit logging.
 *
 * Money is ALWAYS integer agorot (mirrors src/lib/money.ts). The timezone
 * helpers mirror src/lib/format.ts — the +3h bug lives here too if they drift,
 * so they are unit-tested (functions/test) and should eventually be one shared
 * package (P7-1).
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'

const db = getFirestore()

// ── auth helpers ────────────────────────────────────────────────────────────
/** The caller's tenantId claim, or a permission-denied error. */
export function requireTenant(request: CallableRequest): string {
  const tenantId = request.auth?.token?.tenantId
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('permission-denied', 'no tenant claim')
  return tenantId
}
export function callerUid(request: CallableRequest): string {
  return request.auth?.uid ?? 'unknown'
}

// ── timezone ────────────────────────────────────────────────────────────────
export function tzParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: +get('year'), month: +get('month'), day: +get('day'),
    hour: +get('hour'), minute: +get('minute'),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  }
}
function utcFromParts(d: Date, tz: string): number {
  const p = tzParts(d, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}
export function zonedTimeToUtc(ymd: string, hm: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const guess = wall - (utcFromParts(new Date(wall), tz) - wall)
  const offset = utcFromParts(new Date(guess), tz) - guess
  return new Date(wall - offset)
}
export function dateKeyOf(d: Date, tz: string): string {
  const p = tzParts(d, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
export function addDaysKey(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const b = new Date(Date.UTC(y, m - 1, d))
  b.setUTCDate(b.getUTCDate() + n)
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`
}
export const monthKeyOf = (d: Date, tz: string) => dateKeyOf(d, tz).slice(0, 7)
export const yearKeyOf = (d: Date, tz: string) => dateKeyOf(d, tz).slice(0, 4)

// ── tenant config ─────────────────────────────────────────────────────────--
export interface TenantVat { rate: number; inclusive: boolean; registered: boolean }
const DEFAULT_VAT: TenantVat = { rate: 0.18, inclusive: true, registered: true }

export async function tenantConfig(tenantId: string) {
  const snap = await db.doc(`tenants/${tenantId}`).get()
  const data = snap.data() ?? {}
  return {
    tz: (data.timezone as string) ?? 'Asia/Jerusalem',
    vat: (data.vat as TenantVat) ?? DEFAULT_VAT,
    currency: (data.currency as string) ?? 'ILS',
    accountantEmail: (data.accountant?.email as string | undefined) ?? undefined,
    raw: data,
  }
}

// ── money / VAT ───────────────────────────────────────────────────────────--
export interface VatSplit { netAgorot: number; vatAgorot: number; grossAgorot: number; vatRate: number }

/** Split a VAT-inclusive gross (agorot) into net + VAT. rate 0 = עוסק פטור. */
export function splitVatInclusive(grossAgorot: number, vat: TenantVat): VatSplit {
  const gross = Math.round(grossAgorot)
  const rate = vat.registered ? vat.rate : 0
  if (rate <= 0) return { netAgorot: gross, vatAgorot: 0, grossAgorot: gross, vatRate: 0 }
  const net = Math.round(gross / (1 + rate))
  return { netAgorot: net, vatAgorot: gross - net, grossAgorot: gross, vatRate: rate }
}

// ── invoice numbering (functions-only counter, per year, transactional) ──────
export type InvoiceKind = 'invoice' | 'creditInvoice'

/**
 * Allocates the next sequential invoice number for the tenant, per year, INSIDE
 * a provided transaction, and writes the invoice doc. The caller must have
 * already asserted the payment has no invoiceId (idempotence) within the same
 * transaction. Returns the allocated ids so the caller can stamp the payment.
 *
 * [OPEN spec Q3]: when a real Tax-Authority invoicing provider is chosen, THIS
 * function is retired and numbering becomes the provider's responsibility.
 */
export function allocateInvoiceInTx(
  tx: FirebaseFirestore.Transaction,
  tenantId: string,
  year: string,
  counterSnap: FirebaseFirestore.DocumentSnapshot,
  paymentId: string,
  amountAgorot: number,
  kind: InvoiceKind,
): { invoiceId: string; number: string } {
  const next = (counterSnap.data()?.next as number) ?? 1
  const number = `${year}-${String(next).padStart(4, '0')}${kind === 'creditInvoice' ? 'C' : ''}`
  const invoiceId = `inv-${number}`
  tx.set(counterSnap.ref, { year: Number(year), next: next + 1 }, { merge: true })
  tx.set(db.doc(`tenants/${tenantId}/invoices/${invoiceId}`), {
    number, paymentId, amount: amountAgorot, kind,
    createdAt: FieldValue.serverTimestamp(), fileUrl: null,
  })
  return { invoiceId, number }
}

// ── the one idempotent "apply a paid payment" routine ────────────────────────
interface Line { productId: string; name: string; kind: string; quantity: number }

/**
 * Issues the invoice, posts the ledger line, grants entitlements/subscriptions,
 * and updates customer stats for a payment that is (or is becoming) `paid`.
 * ONE transaction; idempotent via the payment's `invoiceId` marker — safe to
 * call from createPayment, markPaymentPaid and the Grow webhook. This replaces
 * the old onPaymentWritten trigger so effects have exactly one writer.
 */
export async function applyPaidPayment(tenantId: string, paymentId: string): Promise<void> {
  const { tz, vat } = await tenantConfig(tenantId)
  const paymentRef = db.doc(`tenants/${tenantId}/payments/${paymentId}`)

  // reads that the transaction needs but that don't require serialisation are
  // done up front to keep the transaction small; the marker check is INSIDE.
  const pre = await paymentRef.get()
  const preData = pre.data()
  if (!preData || preData.invoiceId) return // gone or already applied
  const lines: Line[] =
    Array.isArray(preData.items) && preData.items.length > 0
      ? (preData.items as Line[])
      : [{
          productId: preData.productId,
          name: preData.productSnapshot?.name ?? '',
          kind: preData.productSnapshot?.kind,
          quantity: 1,
        }]
  const productIds = [...new Set(lines.map((l) => l.productId).filter(Boolean))]
  const products = new Map(
    await Promise.all(
      productIds.map(async (id) => {
        const s = await db.doc(`tenants/${tenantId}/products/${id}`).get()
        return [id, s.data()] as const
      }),
    ),
  )

  const createdAt: Date = (preData.createdAt as Timestamp | undefined)?.toDate() ?? new Date()
  const period = monthKeyOf(createdAt, tz)
  const year = yearKeyOf(createdAt, tz)
  const counterRef = db.doc(`tenants/${tenantId}/counters/invoices_${year}`)

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(paymentRef)
    const pay = paySnap.data()
    if (!pay || pay.invoiceId) return // idempotent: someone else applied it
    const counterSnap = await tx.get(counterRef)

    const amount = pay.amount as number
    const pricing = pay.pricing ?? splitVatInclusive(amount, vat)
    const { invoiceId } = allocateInvoiceInTx(tx, tenantId, year, counterSnap, paymentId, amount, 'invoice')

    const summary = lines
      .map((l) => (l.quantity > 1 ? `${l.name} ×${l.quantity}` : l.name))
      .join(', ')
    tx.set(db.doc(`tenants/${tenantId}/ledger/led_${paymentId}`), {
      kind: 'payment', amount,
      netAgorot: pricing.netAgorot, vatAgorot: pricing.vatAgorot, vatRate: pricing.vatRate,
      description: `${summary}${pay.walkInName ? ` — ${pay.walkInName}` : ''}`,
      refId: paymentId, invoiceId, period, createdAt: FieldValue.serverTimestamp(),
    })

    if (pay.customerId) {
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li]
        if (line.kind !== 'punchCard' && line.kind !== 'subscription') continue
        const product = products.get(line.productId)
        for (let u = 0; u < line.quantity; u++) {
          if (line.kind === 'punchCard') {
            const validity = (product?.validityDays as number) ?? 365
            tx.set(db.doc(`tenants/${tenantId}/entitlements/ent_${paymentId}_${li}_${u}`), {
              customerId: pay.customerId, productId: line.productId, kind: 'punchCard',
              remaining: product?.punchCount ?? 0,
              expiresAt: Timestamp.fromDate(new Date(Date.now() + validity * 86400_000)),
              status: 'active', createdAt: FieldValue.serverTimestamp(), sourcePaymentId: paymentId,
            })
          } else {
            const intervalDays = (product?.intervalDays as number) ?? 30
            tx.set(db.doc(`tenants/${tenantId}/subscriptions/sub_${paymentId}_${li}_${u}`), {
              customerId: pay.customerId, productId: line.productId,
              productSnapshot: { name: line.name, price: product?.price ?? 0 },
              startedAt: FieldValue.serverTimestamp(), intervalDays,
              nextChargeAt: Timestamp.fromDate(new Date(Date.now() + intervalDays * 86400_000)),
              pausedAt: null, endsAt: null, status: 'active', dunningCount: 0,
              growTokenRef: pay.growTransactionId ?? null, sourcePaymentId: paymentId,
            })
          }
        }
      }
      tx.update(db.doc(`tenants/${tenantId}/customers/${pay.customerId}`), {
        'stats.totalSpent': FieldValue.increment(amount),
      })
    }

    tx.update(paymentRef, { invoiceId, status: 'paid' })
  })
  logger.info(`applied paid payment ${tenantId}/${paymentId}`)
}

// ── audit ─────────────────────────────────────────────────────────────────--
export async function audit(
  tenantId: string,
  actor: string,
  action: string,
  target: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db.collection(`tenants/${tenantId}/auditLog`).add({
    actor, action, target, at: FieldValue.serverTimestamp(), ...extra,
  })
}
