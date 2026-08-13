import { useMutation } from '@tanstack/react-query'
import { updateDoc } from 'firebase/firestore'
import { tenantDoc } from './db'
import { useTenantId } from './customers'
import type { ClassType, TenantTheme } from '../types/models'

/** Fields of the tenant document editable from Settings. */
export interface TenantPatch {
  name?: string
  logoUrl?: string
  timezone?: string
  currency?: string
  locale?: string
  theme?: TenantTheme
  classTypes?: ClassType[]
  accountant?: { name: string; email: string }
}

/**
 * Writes tenant-document fields. TenantProvider subscribes to the tenant doc
 * with onSnapshot, so saved changes (theme, class types, …) apply live across
 * the app without any cache invalidation here.
 */
export function useUpdateTenant() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: async (patch: TenantPatch) => {
      await updateDoc(tenantDoc(tenantId), patch as Record<string, unknown>)
    },
  })
}
