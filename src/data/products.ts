import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { rawCol, tenantCol } from './db'
import { useTenantId } from './customers'
import type { Product, ProductKind } from '../types/models'

export function useProducts(activeOnly = true) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['products', tenantId, activeOnly],
    queryFn: async () => {
      const base = tenantCol<Product>(tenantId, 'products')
      const q = activeOnly
        ? query(base, where('active', '==', true), orderBy('price'))
        : query(base, orderBy('price'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => d.data())
    },
  })
}

export interface NewProductInput {
  name: string
  description?: string
  price: number
  kind: ProductKind
  punchCount?: number
  intervalDays?: number
}

export function useCreateProduct() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewProductInput) => {
      await addDoc(rawCol(tenantId, 'products'), {
        name: input.name,
        description: input.description ?? '',
        price: input.price,
        kind: input.kind,
        // kind-specific grants (spec §5): punch cards carry a balance,
        // subscriptions carry a billing interval (default 30 days)
        ...(input.kind === 'punchCard' ? { punchCount: input.punchCount ?? 10 } : {}),
        ...(input.kind === 'subscription' ? { intervalDays: input.intervalDays ?? 30 } : {}),
        active: true,
        createdAt: serverTimestamp(),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', tenantId] }),
  })
}

/**
 * Edits a product's fields or archives it (`active: false`). Products are never
 * hard-deleted — historical payments snapshot the name/price, so archiving is
 * safe and deletion would orphan the record.
 */
export function useUpdateProduct() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<Omit<Product, 'id' | 'createdAt'>>) => {
      await updateDoc(doc(rawCol(tenantId, 'products'), id), fields)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', tenantId] }),
  })
}
