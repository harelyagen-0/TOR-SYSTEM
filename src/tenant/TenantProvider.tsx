/**
 * Loads the tenant document (live) and applies its theme as CSS custom
 * properties. Everything below this provider can assume a loaded tenant.
 */
import { onSnapshot } from 'firebase/firestore'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { he } from '../locale/he'
import { tenantDoc } from '../data/db'
import type { TenantConfig } from '../types/models'

const TenantContext = createContext<TenantConfig | null>(null)

function applyTheme(theme: TenantConfig['theme']) {
  const root = document.documentElement
  root.style.setProperty('--t-primary', theme.primary)
  root.style.setProperty('--t-accent', theme.accent)
  root.style.setProperty('--t-surface', theme.surface)
  root.style.setProperty('--t-text', theme.text)
}

export function TenantProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    return onSnapshot(
      tenantDoc(tenantId),
      (snap) => {
        if (!snap.exists()) {
          setFailed(true)
          return
        }
        const config = { ...(snap.data() as Omit<TenantConfig, 'id'>), id: snap.id }
        applyTheme(config.theme)
        setTenant(config)
      },
      () => setFailed(true),
    )
  }, [tenantId])

  if (failed) {
    return <CenteredNote text={he.auth.noTenant} />
  }
  if (!tenant) {
    return <CenteredNote text={he.auth.loadingTenant} />
  }
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
}

function CenteredNote({ text }: { text: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <p className="text-sm font-medium text-muted">{text}</p>
    </div>
  )
}

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant outside TenantProvider')
  return ctx
}
