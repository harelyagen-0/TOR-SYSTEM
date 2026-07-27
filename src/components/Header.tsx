import { useLocation } from 'react-router-dom'
import { fmt, he } from '../locale/he'
import { formatHeaderDate } from '../lib/format'
import { useTenant } from '../tenant/TenantProvider'

const TITLES: Record<string, string> = {
  '/payments': he.nav.payments,
  '/customers': he.nav.customers,
  '/calendar': he.nav.calendar,
  '/analytics': he.nav.analytics,
}

/**
 * Identical on all five pages (spec §6):
 * right (leading) — studio logo · centre — page title · left — today's date.
 */
export function Header() {
  const tenant = useTenant()
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? fmt(he.header.hello, { name: tenant.name })
  const today = new Date()

  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-surface shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-xl items-center gap-3 px-4 py-2">
        <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-field border border-line bg-page">
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="size-full object-cover" />
          ) : (
            <span aria-hidden="true" className="text-lg font-extrabold text-primary">
              {tenant.name.trim().charAt(0)}
            </span>
          )}
        </div>

        <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold">{title}</h1>

        <p className="shrink-0 text-end text-xs font-semibold leading-tight text-muted">
          {formatHeaderDate(today, tenant.timezone, tenant.locale)}
        </p>
      </div>
    </header>
  )
}
