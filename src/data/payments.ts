import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { rawCol } from './db'
import { useTenantId } from './customers'
import { useAuth } from '../auth/AuthProvider'
import type { Payment, PaymentMethod, Product } from '../types/models'
import { useToast } from '../components/Toast'

export interface CartLine {
  product: Product
  quantity: number
}

export interface CreatePaymentInput {
  customerId?: string
  walkInName?: string
  /** optional walk-in contact details (no customer card is created) */
  walkInPhone?: string
  walkInEmail?: string
  /** one or more products, each with a quantity (spec §8.1) */
  items: CartLine[]
  /** final total after promo discount */
  amount: number
  promoCodeId?: string
  method: PaymentMethod
  otherMethodLabel?: string
  status: 'pending' | 'paid'
  growTransactionId?: string
}

/**
 * Writes the payment document. Everything the payment CAUSES — invoice,
 * ledger line, entitlement / subscription, customer stats — is created by the
 * onPaymentWritten Cloud Function, keeping money invariants server-side.
 */
export function useCreatePayment() {
  const tenantId = useTenantId()
  const { user } = useAuth()
  const qc = useQueryClient()
  const { reportError } = useToast()
  return useMutation({
    mutationFn: async (input: CreatePaymentInput) => {
      const first = input.items[0].product
      const ref = await addDoc(rawCol(tenantId, 'payments'), {
        customerId: input.customerId ?? null,
        walkInName: input.walkInName ?? null,
        walkInPhone: input.walkInPhone ?? null,
        walkInEmail: input.walkInEmail ?? null,
        // representative product = first line (refunds + back-compat readers)
        productId: first.id,
        productSnapshot: { name: first.name, price: first.price, kind: first.kind },
        items: input.items.map((l) => ({
          productId: l.product.id,
          name: l.product.name,
          price: l.product.price,
          kind: l.product.kind,
          quantity: l.quantity,
        })),
        amount: input.amount,
        promoCodeId: input.promoCodeId ?? null,
        method: input.method,
        otherMethodLabel: input.otherMethodLabel ?? null,
        status: input.status,
        growTransactionId: input.growTransactionId ?? null,
        invoiceId: null,
        refundOfPaymentId: null,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? 'unknown',
      })
      return ref.id
    },
    onError: reportError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      qc.invalidateQueries({ queryKey: ['metric', tenantId] })
    },
  })
}

/**
 * A refund is a payment with negative amount + refundOfPaymentId (spec §5).
 * The Cloud Function issues the credit invoice (חשבונית זיכוי), posts the
 * negative ledger line, and flips the original payment to `refunded`.
 */
export function useRecordRefund() {
  const tenantId = useTenantId()
  const { user } = useAuth()
  const qc = useQueryClient()
  const { reportError } = useToast()
  return useMutation({
    mutationFn: async (original: Payment) => {
      await addDoc(rawCol(tenantId, 'payments'), {
        customerId: original.customerId ?? null,
        walkInName: original.walkInName ?? null,
        walkInPhone: original.walkInPhone ?? null,
        walkInEmail: original.walkInEmail ?? null,
        productId: original.productId,
        productSnapshot: original.productSnapshot,
        amount: -Math.abs(original.amount),
        promoCodeId: null,
        method: original.method,
        otherMethodLabel: original.otherMethodLabel ?? null,
        status: 'refunded',
        growTransactionId: null,
        invoiceId: null,
        refundOfPaymentId: original.id,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? 'unknown',
      })
    },
    onError: reportError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      qc.invalidateQueries({ queryKey: ['metric', tenantId] })
      qc.invalidateQueries({ queryKey: ['ledger', tenantId] })
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
