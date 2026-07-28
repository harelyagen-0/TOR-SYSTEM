import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import { rawCol, tenantCol } from './db'
import { useTenantId } from './customers'
import type { Subscription, SubscriptionStatus } from '../types/models'
import { useToast } from '../components/Toast'

export function useSubscriptions() {
  const tenantId = useTenantId()
  return useQuery({
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
  const { reportError } = useToast()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SubscriptionStatus }) => {
      await updateDoc(doc(rawCol(tenantId, 'subscriptions'), id), { status })
    },
    onError: reportError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions', tenantId] }),
  })
}
