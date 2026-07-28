/**
 * Staff reads come straight from Firestore; every WRITE goes through an
 * owner-gated callable (functions/src/staff.ts), because the staff doc drives
 * the custom claims that firestore.rules enforces — the collection is
 * write-denied to all clients, including the owner's.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDocs, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { tenantCol } from './db'
import { useTenantId } from './customers'
import type { Permissions, StaffRole } from '../auth/permissions'
import type { StaffMember } from '../types/models'

export function useStaff() {
  const tenantId = useTenantId()
  return useQuery({
    queryKey: ['staff', tenantId],
    queryFn: async () => {
      const snap = await getDocs(
        query(tenantCol<StaffMember>(tenantId, 'staff'), orderBy('firstName')),
      )
      return snap.docs.map((d) => d.data())
    },
  })
}

export interface NewStaffInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  role: StaffRole
  permissions: Permissions
  instructorId?: string | null
}

/** Returns the one-time password to hand over — it is never retrievable again. */
export function useCreateStaff() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewStaffInput) => {
      const call = httpsCallable<NewStaffInput, { uid: string; tempPassword: string }>(
        functions,
        'createStaff',
      )
      return (await call(input)).data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', tenantId] }),
  })
}

export interface UpdateStaffInput {
  uid: string
  firstName?: string
  lastName?: string
  phone?: string
  role?: StaffRole
  permissions?: Permissions
  instructorId?: string | null
}

export function useUpdateStaff() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateStaffInput) => {
      const call = httpsCallable<UpdateStaffInput, { ok: boolean }>(functions, 'updateStaff')
      await call(input)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', tenantId] }),
  })
}

/** Staff are deactivated, never deleted — Payment.createdBy references the uid. */
export function useSetStaffActive() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { uid: string; active: boolean }) => {
      const call = httpsCallable<typeof input, { ok: boolean }>(functions, 'setStaffActive')
      await call(input)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', tenantId] }),
  })
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: async (uid: string) => {
      const call = httpsCallable<{ uid: string }, { tempPassword: string }>(
        functions,
        'resetStaffPassword',
      )
      return (await call({ uid })).data
    },
  })
}
