import { useLocation, useNavigate } from 'react-router-dom'
import { fmt, he } from '../locale/he'
import { formatHeaderDate } from '../lib/format'
import { useTenant } from '../tenant/TenantProvider'

const TITLES: Record<string, string> = {
  '/payments': he.nav.payments,
  '/customers': he.nav.customers,
  '/calendar': he.nav.calendar,
  '/analytics': he.nav.analytics,
  '/settings': he.settings.title,
}

/**
 * Identical on all five pages (spec §6):
 * right (leading) — studio logo · centre — page title · left — today's date.
 */
export function Header() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? fmt(he.header.hello, { name: tenant.name })
  const today = new Date()
  const onSettings = pathname === '/settings'

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

        <button
          type="button"
          onClick={() => navigate('/settings')}
          aria-label={he.settings.open}
          aria-current={onSettings ? 'page' : undefined}
          className={`grid size-10 shrink-0 place-items-center rounded-field border border-line bg-page ${
            onSettings ? 'text-accent' : 'text-muted'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
          </svg>
        </button>
      </div>
    </header>
  )
}
