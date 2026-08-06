import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDocs, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { tenantCol } from './db'
import { useTenantId } from './customers'
import type { Subscription } from '../types/models'

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

/**
 * Subscription state transitions go through callables so the billing side
 * effects are correct: pause records pausedAt, resume pushes nextChargeAt by
 * the paused duration, cancel stops at the end of the paid period.
 */
export function usePauseSubscription() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) => {
      const call = httpsCallable(functions, paused ? 'pauseSubscription' : 'resumeSubscription')
      await call({ id })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions', tenantId] }),
  })
}

export function useCancelSubscription() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, immediate }: { id: string; immediate?: boolean }) => {
      const call = httpsCallable(functions, 'cancelSubscription')
      await call({ id, immediate })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions', tenantId] }),
  })
}
