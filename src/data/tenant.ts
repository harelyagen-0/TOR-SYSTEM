/**
 * Writes to the tenant config document (studio settings). Reads happen live via
 * TenantProvider's onSnapshot, so a successful update re-themes and re-renders
 * the whole app with no query invalidation needed here.
 *
 * Security: firestore.rules lets an operator UPDATE only their own tenant doc
 * (create/delete stay closed) — the settings page is the sole writer.
 */
import { useMutation } from '@tanstack/react-query'
import { updateDoc } from 'firebase/firestore'
import { tenantDoc } from './db'
import { useTenantId } from './customers'
import type { TenantConfig } from '../types/models'

/** A patch of top-level tenant fields (id is never written). */
export type TenantPatch = Partial<Omit<TenantConfig, 'id'>>

export function useUpdateTenant() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: async (patch: TenantPatch) => {
      await updateDoc(tenantDoc(tenantId), patch)
    },
  })
}
