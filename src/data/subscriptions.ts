import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import { rawCol, tenantCol } from './db'
import { useTenantId } from './customers'
import { useCan } from '../auth/AuthProvider'
import type { Subscription, SubscriptionStatus } from '../types/models'

export function useSubscriptions() {
  const tenantId = useTenantId()
  const enabled = useCan('payments')
  return useQuery({
    enabled,
    queryKey: ['subscriptions', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<Subscription>(tenantId, 'subscriptions'), orderBy('nextChargeAt')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export function useUpdateSubscriptionStatus() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SubscriptionStatus }) => {
      await updateDoc(doc(rawCol(tenantId, 'subscriptions'), id), { status })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions', tenantId] }),
  })
}
