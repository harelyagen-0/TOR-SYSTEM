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
  price: number
  kind: ProductKind
  /** punchCard only */
  punchCount?: number
  /** subscription only; default 30 */
  intervalDays?: number
  /**
   * Which class TYPES this product grants entry to — the product-side mirror of
   * a class/template's `allowedProductIds`. `null` / absent = every class type
   * is covered (the default). A list restricts the product to those class types
   * only, so a class of any other type is paid as a single entry.
   */
  allowedClassTypeIds?: string[] | null
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
  price: number // unit price at time of sale
  kind: ProductKind
  quantity: number
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
  amount: number // total after discount; negative for refunds
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
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'

export interface Subscription {
  id: string
  customerId: string
  productId: string
  productSnapshot: { name: string; price: number }
  startedAt: Timestamp
  intervalDays: number
  nextChargeAt: Timestamp
  endsAt?: Timestamp
  status: SubscriptionStatus
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
  /**
   * Which pass / subscription products grant entry to this class.
   * `null` / absent = every pass and subscription is accepted (the default).
   * A list restricts entry to those products only. Mirrors ClassTemplate;
   * lets a class created from scratch carry its own entry rules.
   */
  allowedProductIds?: string[] | null
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
  /** positive for income, negative for refunds and expenses */
  amount: number
  description: string
  refId: string // payment / expense doc id
  invoiceId?: string
  period: string // '2026-07' — month key in studio timezone
  createdAt: Timestamp
}

export interface MonthlyReport {
  id: string
  period: string // '2026-07'
  totals: { income: number; expenses: number; refunds: number; net: number }
  lineItems: Array<Omit<LedgerLine, 'id'>>
  fileUrl?: string
  sentAt?: Timestamp
}
