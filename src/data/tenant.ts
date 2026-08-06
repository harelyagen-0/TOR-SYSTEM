import { useMutation } from '@tanstack/react-query'
import { updateDoc } from 'firebase/firestore'
import { tenantDoc } from './db'
import { useTenantId } from './customers'
import type { TenantConfig } from '../types/models'

/** Fields the studio may edit about itself (mirrors firestore.rules). */
export type TenantEditable = Partial<
  Pick<TenantConfig, 'name' | 'logoUrl' | 'theme' | 'classTypes' | 'accountant' | 'policy'>
>

/**
 * Updates the tenant's own settings. TenantProvider subscribes to the doc live,
 * so the theme/name refresh app-wide the instant this commits — no invalidate.
 */
export function useUpdateTenant() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: async (fields: TenantEditable) => {
      await updateDoc(tenantDoc(tenantId), fields)
    },
  })
}
