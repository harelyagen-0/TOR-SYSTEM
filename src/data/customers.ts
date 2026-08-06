import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { rawCol, tenantCol } from './db'
import { useAuth } from '../auth/AuthProvider'
import type { Customer, Entitlement, Payment, Registration, Session } from '../types/models'

export function useTenantId(): string {
  const { tenantId } = useAuth()
  if (!tenantId) throw new Error('no tenant in session')
  return tenantId
}

// ── queries ─────────────────────────────────────────────────────────────────
export function useCustomers() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['customers', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<Customer>(tenantId, 'customers'), orderBy('firstName')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

/** Match on name OR phone (spec §9); digits are compared normalised. */
export function filterCustomers(customers: Customer[], q: string): Customer[] {
  const needle = q.trim()
  if (!needle) return customers
  const digits = needle.replace(/\D/g, '')
  const lower = needle.toLowerCase()
  return customers.filter((c) => {
    const name = `${c.firstName} ${c.lastName}`.toLowerCase()
    if (name.includes(lower)) return true
    if (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)) return true
    return c.publicId.toLowerCase() === lower
  })
}

export function useCustomerPayments(customerId: string | null) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['payments', tenantId, 'byCustomer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const snap = await getDocs(
        query(
          tenantCol<Payment>(tenantId, 'payments'),
          where('customerId', '==', customerId),
          orderBy('createdAt', 'desc'),
        ),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export function useCustomerEntitlements(customerId: string | null) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['entitlements', tenantId, customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const snap = await getDocs(
        query(
          tenantCol<Entitlement>(tenantId, 'entitlements'),
          where('customerId', '==', customerId),
        ),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export interface RegistrationHistoryRow {
  registration: Registration
  session: Session | null
}

/** Full activity log for a customer: every class they registered for, joined to
 *  its session (for title + real class date) and ordered by class date desc. */
export function useCustomerRegistrations(customerId: string | null) {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['registrations', tenantId, 'byCustomer', customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<RegistrationHistoryRow[]> => {
      const snap = await getDocs(
        query(
          tenantCol<Registration>(tenantId, 'registrations'),
          where('customerId', '==', customerId),
        ),
      )
      const regs = snap.docs.map((d) => d.data())
      // join each registration to its session, de-duplicating the fetches
      const sessionIds = [...new Set(regs.map((r) => r.sessionId))]
      const sessions = await Promise.all(
        sessionIds.map(async (id) => {
          const s = await getDoc(doc(rawCol(tenantId, 'sessions'), id))
          return s.exists() ? ({ ...(s.data() as Omit<Session, 'id'>), id: s.id }) : null
        }),
      )
      const byId = new Map(sessions.filter(Boolean).map((s) => [s!.id, s!]))
      return regs
        .map((registration) => ({
          registration,
          session: byId.get(registration.sessionId) ?? null,
        }))
        .sort((a, b) => {
          // order by class date (fall back to when the registration was made)
          const at = a.session?.startAt.toMillis() ?? a.registration.createdAt.toMillis()
          const bt = b.session?.startAt.toMillis() ?? b.registration.createdAt.toMillis()
          return bt - at
        })
    },
  })
}

// ── mutations ───────────────────────────────────────────────────────────────
export interface NewCustomerInput {
  firstName: string
  lastName: string
  phone: string
  email?: string
}

/**
 * Creates a customer via the server callable (the client can no longer write
 * the customers collection or the counter). The human-readable publicId is
 * allocated transactionally server-side.
 */
export function useCreateCustomer() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewCustomerInput): Promise<{ id: string; publicId: string }> => {
      const call = httpsCallable<NewCustomerInput, { id: string; publicId: string }>(functions, 'createCustomer')
      const res = await call(input)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', tenantId] }),
  })
}

export function useUpdateCustomer() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<NewCustomerInput> & { notes?: string }) => {
      await updateDoc(doc(rawCol(tenantId, 'customers'), id), fields)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', tenantId] }),
  })
}
