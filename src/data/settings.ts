import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from '../lib/firebase'
import { tenantDoc } from './db'
import { useTenantId } from './customers'
import type { ClassType, TenantConfig, TenantPolicies, TenantTheme } from '../types/models'

/**
 * The editable half of the tenant config. `integrations` is deliberately
 * absent: it holds provider credentials, the doc is readable by every operator,
 * and firestore.rules rejects a write that touches any key outside this set.
 */
export interface TenantSettingsPatch {
  name?: string
  logoUrl?: string | null
  timezone?: string
  currency?: string
  locale?: string
  theme?: TenantTheme
  classTypes?: ClassType[]
  accountant?: TenantConfig['accountant']
  policies?: TenantPolicies
}

export function useUpdateTenant() {
  const tenantId = useTenantId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: TenantSettingsPatch) => {
      // Firestore's UpdateData wants dotted-path index signatures; the same
      // reason db.ts keeps a raw, untyped ref for the write side.
      await updateDoc(tenantDoc(tenantId), patch as Record<string, unknown>)
    },
    // the tenant doc is live via onSnapshot in TenantProvider, so the UI
    // updates itself; this only refreshes anything keyed off tenant data
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  })
}

/** Uploads a studio logo and returns its download URL (storage.rules: set:edit). */
export function useUploadLogo() {
  const tenantId = useTenantId()
  return useMutation({
    mutationFn: async (file: File) => {
      const path = `tenants/${tenantId}/branding/logo_${Date.now()}_${file.name}`
      const ref = storageRef(storage, path)
      await uploadBytes(ref, file)
      return getDownloadURL(ref)
    },
  })
}
