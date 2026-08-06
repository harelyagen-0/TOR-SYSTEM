import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { rawCol, tenantCol } from './db'
import { useTenantId } from './customers'
import { he } from '../locale/he'
import type { PromoCode } from '../types/models'

export function usePromoCodes() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['promoCodes', tenantId],
    queryFn: async () => {
      const snap = await getDocs(tenantCol<PromoCode>(tenantId, 'promoCodes'))
      return snap.docs.map((d) => d.data())
    },
  })
}

export type PromoValidation =
  | { ok: true; promo: PromoCode; discountedAmount: number }
  | { ok: false; reason: string }

/** one purchased line the discount is measured against */
export interface PromoLine {
  productId: string
  price: number
  quantity: number
}

/**
 * Validates a typed code against audience + expiry + usage (spec §8.1) and
 * applies it to a cart. A product-restricted code discounts only its eligible
 * lines; the returned `discountedAmount` is the whole cart's new total.
 * Audience mapping: 'new' → creating a new customer; 'existing' → an existing
 * customer; a walk-in matches only 'all'.
 */
export function validatePromo(
  codes: PromoCode[],
  typed: string,
  who: 'existing' | 'new' | 'walkIn',
  lines: PromoLine[],
): PromoValidation {
  const code = codes.find(
    (c) => c.code.toLowerCase() === typed.trim().toLowerCase() && c.active,
  )
  if (!code) return { ok: false, reason: he.payments.promoInvalid }
  if (code.validUntil && code.validUntil.toMillis() < Date.now()) {
    return { ok: false, reason: he.payments.promoExpired }
  }
  if (code.usageLimit != null && code.usedCount >= code.usageLimit) {
    return { ok: false, reason: he.payments.promoUsedUp }
  }
  const audienceOk =
    code.audience === 'all' ||
    (code.audience === 'new' && who === 'new') ||
    (code.audience === 'existing' && who === 'existing')
  if (!audienceOk) return { ok: false, reason: he.payments.promoAudience }

  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0)
  // a product-restricted code discounts only its eligible lines
  const restricted = !!(code.productIds && code.productIds.length > 0)
  const eligible = restricted
    ? lines.filter((l) => code.productIds!.includes(l.productId))
    : lines
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.price * l.quantity, 0)
  if (restricted && eligibleSubtotal === 0) {
    return { ok: false, reason: he.payments.promoProduct }
  }
  const discount =
    code.discountKind === 'percent'
      ? Math.round(eligibleSubtotal * (code.value / 100))
      : Math.min(code.value, eligibleSubtotal)
  return { ok: true, promo: code, discountedAmount: Math.max(0, total - discount) }
}

export interface NewPromoInput {
  code: string
  name: string
  description?: string
  discountKind: 'percent' | 'fixed'
  value: number
  validUntil?: Date
  audience: 'new' | 'existing' | 'all'
  usageLimit?: number
  /** null = every product (default); a list restricts the discount */
  productIds?: string[] | null
}

export function useCreatePromo() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewPromoInput) => {
      await addDoc(rawCol(tenantId, 'promoCodes'), {
        code: input.code.trim().toUpperCase(),
        name: input.name,
        description: input.description ?? '',
        discountKind: input.discountKind,
        value: input.value,
        validUntil: input.validUntil ? Timestamp.fromDate(input.validUntil) : null,
        audience: input.audience,
        usageLimit: input.usageLimit ?? null,
        productIds: input.productIds ?? null,
        usedCount: 0,
        active: true,
        createdAt: serverTimestamp(),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promoCodes', tenantId] }),
  })
}

/**
 * Edits an existing code (fix a mistake, extend the validity) or flips it
 * active/inactive ("cancel" the coupon). Only the fields passed are written;
 * `validUntil`/`usageLimit` are cleared when present but empty.
 */
export interface UpdatePromoInput extends Partial<NewPromoInput> {
  active?: boolean
}

export function useUpdatePromo() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: UpdatePromoInput & { id: string }) => {
      const data: Record<string, unknown> = {}
      if (fields.code !== undefined) data.code = fields.code.trim().toUpperCase()
      if (fields.name !== undefined) data.name = fields.name
      if (fields.description !== undefined) data.description = fields.description ?? ''
      if (fields.discountKind !== undefined) data.discountKind = fields.discountKind
      if (fields.value !== undefined) data.value = fields.value
      if ('validUntil' in fields) data.validUntil = fields.validUntil ? Timestamp.fromDate(fields.validUntil) : null
      if (fields.audience !== undefined) data.audience = fields.audience
      if ('usageLimit' in fields) data.usageLimit = fields.usageLimit ?? null
      if ('productIds' in fields) data.productIds = fields.productIds ?? null
      if (fields.active !== undefined) data.active = fields.active
      await updateDoc(doc(rawCol(tenantId, 'promoCodes'), id), data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promoCodes', tenantId] }),
  })
}
