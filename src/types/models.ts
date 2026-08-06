/**
 * Data model (spec §5). Field names follow the spec; every document type gains
 * an `id` when read (added by the Firestore converter in src/data/db.ts).
 *
 * Timestamps are stored as UTC Firestore Timestamps and rendered in the studio
 * timezone from tenant config.
 */
import type { Timestamp } from 'firebase/firestore'

// ── tenant ──────────────────────────────────────────────────────────────────
export interface TenantTheme {
  primary: string
  accent: string
  surface: string
  text: string
}

export interface ClassType {
  id: string
  labelHe: string
  color: string
}

export interface TenantConfig {
  id: string
  name: string
  logoUrl?: string
  timezone: string // e.g. 'Asia/Jerusalem'
  currency: string // e.g. 'ILS'
  locale: string // e.g. 'he-IL'
  theme: TenantTheme
  classTypes: ClassType[]
  accountant?: { name: string; email: string }
  /**
   * VAT (מע"מ) model. Catalogue prices are VAT-INCLUSIVE when `inclusive` is
   * true (the default). `registered: false` = עוסק פטור, no VAT charged.
   * `rate` is a fraction (0.18 = 18%) and is snapshotted onto each sale, never
   * read historically — the rate changes over time.
   */
  vat?: { rate: number; inclusive: boolean; registered: boolean }
  /** Class cancellation policy (spec §10). */
  policy?: { lateCancelHours: number; lateCancelCharges: boolean }
  integrations?: {
    grow?: Record<string, unknown>
    invoicing?: Record<string, unknown>
    whatsapp?: Record<string, unknown>
  }
}

// ── customers ───────────────────────────────────────────────────────────────
export interface Customer {
  id: string
  firstName: string
  lastName: string
  phone: string
  email?: string
  /** Human-readable id, e.g. C-0142, generated transactionally on create. */
  publicId: string
  isWalkIn: boolean
  notes?: string
  stats: {
    totalSpent: number
    sessionsAttended: number
    lastVisitAt: Timestamp | null
  }
  createdAt: Timestamp
}

// ── products ────────────────────────────────────────────────────────────────
export type ProductKind = 'single' | 'punchCard' | 'subscription'

export interface Product {
  id: string
  name: string
  description?: string
  /** VAT-inclusive price in integer AGOROT (see src/lib/money.ts). */
  price: number
  kind: ProductKind
  /** punchCard only */
  punchCount?: number
  /** punchCard only — days the pass stays valid from purchase (default 365). */
  validityDays?: number
  /** subscription only; default 30 */
  intervalDays?: number
  active: boolean
  createdAt: Timestamp
}

// ── payments ────────────────────────────────────────────────────────────────
export type PaymentMethod = 'card' | 'cash' | 'other'
export type PaymentStatus = 'pending' | 'paid' | 'refunded'

/** one line of a purchase — a product bought at a quantity (spec §8.1) */
export interface PaymentItem {
  productId: string
  name: string
  price: number // unit price at time of sale, in AGOROT
  kind: ProductKind
  quantity: number
}

/** Server-computed money breakdown of a payment (all AGOROT). Snapshotted so
 *  historical VAT never shifts when the rate changes. */
export interface PaymentPricing {
  subtotalAgorot: number // sum of line prices before discount (gross)
  discountAgorot: number
  grossAgorot: number // charged total = subtotal − discount
  netAgorot: number // VAT-exclusive base
  vatAgorot: number
  vatRate: number // fraction, e.g. 0.18; 0 for עוסק פטור
}

export interface Payment {
  id: string
  /** exactly one of customerId / walkInName is set */
  customerId?: string
  walkInName?: string
  productId: string
  /** name + price at time of sale — never join to a mutable product.
   *  For a multi-line purchase this is the first line (back-compat / refunds). */
  productSnapshot: { name: string; price: number; kind: ProductKind }
  /** the full cart (present for app-created payments); when set it is the
   *  source of truth for what was granted. A single-product sale has one line. */
  items?: PaymentItem[]
  amount: number // total after discount, in AGOROT; negative for refunds
  /** server-computed net/VAT/discount breakdown (absent on legacy docs) */
  pricing?: PaymentPricing
  /** how much of this payment has been refunded so far, in AGOROT (partials) */
  refundedAmount?: number
  promoCodeId?: string
  method: PaymentMethod
  otherMethodLabel?: string
  status: PaymentStatus
  growTransactionId?: string
  invoiceId?: string
  /** set when this payment IS a refund of another payment */
  refundOfPaymentId?: string
  createdAt: Timestamp
  createdBy: string
}

// ── entitlements (what a customer owns) ─────────────────────────────────────
export interface Entitlement {
  id: string
  customerId: string
  productId: string
  kind: ProductKind
  /** punch cards */
  remaining?: number
  expiresAt?: Timestamp
  status: 'active' | 'used' | 'expired'
  createdAt: Timestamp
}

// ── subscriptions ───────────────────────────────────────────────────────────
export type SubscriptionStatus = 'active' | 'paused' | 'pastDue' | 'cancelled'

export interface Subscription {
  id: string
  customerId: string
  productId: string
  productSnapshot: { name: string; price: number } // price in AGOROT
  startedAt: Timestamp
  intervalDays: number
  nextChargeAt: Timestamp
  /** set while paused, so resume can push nextChargeAt by the paused duration */
  pausedAt?: Timestamp | null
  endsAt?: Timestamp | null
  status: SubscriptionStatus
  /** consecutive failed charges; drives dunning → cancellation */
  dunningCount?: number
  growTokenRef?: string
}

// ── promo codes ─────────────────────────────────────────────────────────────
export interface PromoCode {
  id: string
  code: string
  name: string
  description?: string
  discountKind: 'percent' | 'fixed'
  value: number
  validUntil?: Timestamp
  audience: 'new' | 'existing' | 'all'
  usageLimit?: number
  usedCount: number
  active: boolean
  /**
   * Which products the discount applies to.
   * `null` / absent = every product (the default); a list restricts the code
   * to those products only — e.g. a discount valid only on a single entry, or
   * only on this month's subscription.
   */
  productIds?: string[] | null
}

// ── expenses ────────────────────────────────────────────────────────────────
export interface Expense {
  id: string
  name: string
  description?: string
  amount: number
  date: Timestamp
  attachmentUrl?: string
  category?: string
  /** how the expense was paid — optional (card / cash / other) */
  paymentMethod?: PaymentMethod
  /** free-text detail when paymentMethod === 'other' (e.g. bank transfer) */
  paymentMethodLabel?: string
  createdAt: Timestamp
}

// ── instructors ─────────────────────────────────────────────────────────────
export interface Instructor {
  id: string
  firstName: string
  lastName: string
  experience?: string
  /** POSITIVE permission list of tenant classType ids — nothing else offered */
  allowedClassTypes: string[]
  phone?: string
  color?: string
  active: boolean
}

// ── scheduling ──────────────────────────────────────────────────────────────
export interface ClassTemplate {
  id: string
  title: string
  classTypeId: string
  defaultInstructorId?: string
  capacity: number
  durationMinutes: number
  price: number
  /** 'HH:mm' in studio timezone */
  defaultStartTime?: string
  room?: string
  /**
   * Which pass / subscription products grant entry to this class.
   * `null` / absent = every pass and subscription is accepted (the default).
   * A list restricts entry to those products only — e.g. a meditation class
   * excluded from the yoga subscription, so other customers pay a single entry.
   */
  allowedProductIds?: string[] | null
}

export interface Recurrence {
  id: string
  templateId: string
  weekday: number // 0 = Sunday … 6 = Saturday
  time: string // 'HH:mm' studio timezone
  startsOn: string // 'YYYY-MM-DD' studio timezone
  endsOn?: string
  /** dates ('YYYY-MM-DD') whose materialised session was deleted */
  exceptions: string[]
}

export interface Session {
  id: string
  templateId?: string
  recurrenceId?: string
  /** date key 'YYYY-MM-DD' (studio tz) — recurrence occurrence identity */
  occurrenceDate?: string
  title: string
  classTypeId: string
  instructorId?: string
  startAt: Timestamp
  endAt: Timestamp
  capacity: number
  price: number
  registeredCount: number
  status: 'scheduled' | 'cancelled'
}

export type RegistrationStatus = 'booked' | 'attended' | 'noShow' | 'cancelled'

/** How a class registration was covered — single entry (cash/card/other),
 *  a punch off a 10-pass, or an active subscription. */
export interface RegistrationCoverage {
  kind: 'single' | 'punchCard' | 'subscription'
  /** single entries only — how that one class was paid */
  method?: PaymentMethod
  otherMethodLabel?: string
}

export interface Registration {
  id: string
  sessionId: string
  customerId: string
  status: RegistrationStatus
  /** set when the class was actually attended — the correct basis for the
   *  "attended this month" metric (createdAt is when the booking was made) */
  attendedAt?: Timestamp | null
  /** true when a cancellation fell outside the policy window (still charged) */
  lateCancel?: boolean
  /** how this class was paid for (present once a seat is consumed or charged) */
  coverage?: RegistrationCoverage
  sourceEntitlementId?: string
  paymentId?: string
  createdAt: Timestamp
}

// ── accountant ledger ───────────────────────────────────────────────────────
export type LedgerLineKind = 'payment' | 'refund' | 'expense'

export interface LedgerLine {
  id: string
  kind: LedgerLineKind
  /** positive for income, negative for refunds and expenses, in AGOROT */
  amount: number
  /** VAT breakdown (AGOROT) for the accountant; absent on expenses w/o VAT */
  netAgorot?: number
  vatAgorot?: number
  vatRate?: number
  description: string
  refId: string // payment / expense doc id
  invoiceId?: string
  period: string // '2026-07' — month key in studio timezone
  createdAt: Timestamp
}

export interface MonthlyReport {
  id: string
  period: string // '2026-07'
  /** all AGOROT; vatCollected is the VAT the studio owes for the period */
  totals: {
    income: number
    expenses: number
    refunds: number
    net: number
    vatCollected?: number
  }
  lineItems: Array<Omit<LedgerLine, 'id'>>
  /** immutable version number — a re-send does not recompute (P1-9) */
  version?: number
  ledgerCursor?: Timestamp | null
  fileUrl?: string
  sentAt?: Timestamp
}
