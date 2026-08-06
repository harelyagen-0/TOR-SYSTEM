import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import { rawCol } from './db'
import { useTenantId } from './customers'
import { functions } from '../lib/firebase'
import type { Payment, PaymentMethod, Product } from '../types/models'

export interface CartLine {
  product: Product
  quantity: number
}

export interface CreatePaymentInput {
  who: 'existing' | 'new' | 'walkIn'
  customerId?: string
  newCustomer?: { firstName: string; lastName?: string; phone: string; email?: string }
  walkInName?: string
  /** one or more products, each with a quantity (spec §8.1) */
  items: CartLine[]
  promoCode?: string
  method: PaymentMethod
  cardMode?: 'charge' | 'link'
  otherMethodLabel?: string
}

export interface CreatePaymentResult {
  paymentId: string
  invoiceId: string | null
  status: 'pending' | 'paid'
  paymentUrl: string | null
  customerId: string | null
}

/**
 * Creates a payment via the server callable. Pricing, promo validation +
 * consumption, the card charge, the invoice, the ledger line and the
 * entitlement/subscription grants are ALL server-side (functions/src/payments.ts)
 * — the client no longer writes the payment doc, so an amount can never be
 * forged and a promo can never be over-redeemed.
 */
export function useCreatePayment() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreatePaymentInput): Promise<CreatePaymentResult> => {
      const call = httpsCallable<Record<string, unknown>, CreatePaymentResult>(functions, 'createPayment')
      const res = await call({
        who: input.who,
        customerId: input.customerId,
        newCustomer: input.newCustomer,
        walkInName: input.walkInName,
        items: input.items.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        promoCode: input.promoCode,
        method: input.method,
        cardMode: input.cardMode,
        otherMethodLabel: input.otherMethodLabel,
      })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      qc.invalidateQueries({ queryKey: ['metric', tenantId] })
      qc.invalidateQueries({ queryKey: ['customers', tenantId] })
    },
  })
}

/**
 * Records a refund via the server callable: it calls the payment provider,
 * issues the credit invoice, posts the negative ledger line, reverses the
 * granted entitlement/subscription, customer stats and promo, and supports
 * partial amounts (spec §8.2.2).
 */
export function useRecordRefund() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, amount, reason }: { paymentId: string; amount?: number; reason?: string }) => {
      const call = httpsCallable(functions, 'refundPayment')
      await call({ paymentId, amount, reason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      qc.invalidateQueries({ queryKey: ['metric', tenantId] })
      qc.invalidateQueries({ queryKey: ['ledger', tenantId] })
      qc.invalidateQueries({ queryKey: ['customers', tenantId] })
    },
  })
}

/** Manually mark a pending payment (unfinished Grow link, cash owed) as paid. */
export function useMarkPaid() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const call = httpsCallable(functions, 'markPaymentPaid')
      await call({ paymentId })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      qc.invalidateQueries({ queryKey: ['ledger', tenantId] })
      qc.invalidateQueries({ queryKey: ['metric', tenantId] })
    },
  })
}

/**
 * Live view of one payment doc — the receipt step watches it so the invoice
 * number appears the moment the Cloud Function issues it.
 */
export function useWatchPayment(paymentId: string | null): Payment | null {
  const tenantId = useTenantId()
  const [payment, setPayment] = useState<Payment | null>(null)
  useEffect(() => {
    setPayment(null)
    if (!paymentId) return
    return onSnapshot(doc(rawCol(tenantId, 'payments'), paymentId), (snap) => {
      if (snap.exists()) setPayment({ ...(snap.data() as Omit<Payment, 'id'>), id: snap.id })
    })
  }, [tenantId, paymentId])
  return payment
}
