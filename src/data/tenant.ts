/**
 * Tenant-config writes (studio settings). Reads flow through TenantProvider's
 * live snapshot, so a successful save reflects everywhere — including the live
 * theme — with no query invalidation needed here.
 *
 * Scope: only the tenant document itself. The function-owned subcollections
 * (ledger, entitlements, reports, invoices) stay client-read-only in
 * firestore.rules; this hook can touch none of them.
 */
import { useMutation } from '@tanstack/react-query'
import { updateDoc } from 'firebase/firestore'
import { tenantDoc } from './db'
import { useTenantId } from './customers'
import type { TenantConfig } from '../types/models'

/** Fields an operator may edit from the settings page. */
export type TenantPatch = Partial<
  Pick<
    TenantConfig,
    'name' | 'logoUrl' | 'timezone' | 'currency' | 'locale' | 'theme' | 'classTypes' | 'accountant'
  >
>

export function useUpdateTenant() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: async (patch: TenantPatch) => {
      await updateDoc(tenantDoc(tenantId), patch)
    },
  })
}
