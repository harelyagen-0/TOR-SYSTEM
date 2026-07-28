import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDoc, getDocs, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from '../lib/firebase'
import { rawCol, tenantCol } from './db'
import { useTenantId } from './customers'
import { useCan } from '../auth/AuthProvider'
import type { Expense, PaymentMethod } from '../types/models'

export function useExpenses() {
  const tenantId = useTenantId()
  const enabled = useCan('finance')
  return useQuery({
    enabled,
    queryKey: ['expenses', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<Expense>(tenantId, 'expenses'), orderBy('date', 'desc')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export interface NewExpenseInput {
  name: string
  description?: string
  amount: number
  date: Date
  category?: string
  /** optional — how the expense was paid */
  paymentMethod?: PaymentMethod
  paymentMethodLabel?: string
  /** photo or PDF of the receipt (spec §8.2) */
  attachment?: File
}

export function useCreateExpense() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewExpenseInput) => {
      let attachmentUrl: string | null = null
      if (input.attachment) {
        const path = `tenants/${tenantId}/receipts/${Date.now()}_${input.attachment.name}`
        const ref = storageRef(storage, path)
        await uploadBytes(ref, input.attachment)
        attachmentUrl = await getDownloadURL(ref)
      }
      // the ledger line is posted by the onExpenseCreated Cloud Function
      await addDoc(rawCol(tenantId, 'expenses'), {
        name: input.name,
        description: input.description ?? '',
        amount: input.amount,
        date: Timestamp.fromDate(input.date),
        attachmentUrl,
        category: input.category ?? '',
        paymentMethod: input.paymentMethod ?? null,
        paymentMethodLabel: input.paymentMethod === 'other' ? (input.paymentMethodLabel ?? '') : null,
        createdAt: serverTimestamp(),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', tenantId] })
      qc.invalidateQueries({ queryKey: ['ledger', tenantId] })
    },
  })
}
