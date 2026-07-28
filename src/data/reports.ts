import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDocs, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { tenantCol } from './db'
import { useTenantId } from './customers'
import type { LedgerLine, MonthlyReport } from '../types/models'
import { useToast } from '../components/Toast'

/** The running ledger for one month — written as events happen (spec §8.3). */
export function useLedger(period: string) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['ledger', tenantId, period],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          tenantCol<LedgerLine>(tenantId, 'ledger'),
          where('period', '==', period),
          orderBy('createdAt', 'desc'),
        ),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export function usePastReports() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['reports', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<MonthlyReport>(tenantId, 'reports'), orderBy('period', 'desc')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

/** Manual re-send of a period's report (spec §8.3) via callable function. */
export function useResendReport() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  const { reportError } = useToast()
  return useMutation({
    mutationFn: async (period: string) => {
      const call = httpsCallable(functions, 'resendReport')
      await call({ period })
    },
    onError: reportError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', tenantId] }),
  })
}

export function sumLedger(lines: LedgerLine[]) {
  let income = 0
  let expenses = 0
  let refunds = 0
  for (const l of lines) {
    if (l.kind === 'payment') income += l.amount
    else if (l.kind === 'expense') expenses += -l.amount
    else if (l.kind === 'refund') refunds += l.amount
  }
  return { income, expenses, refunds, net: income + refunds - expenses }
}
