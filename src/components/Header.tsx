import { Link, useLocation } from 'react-router-dom'
import { fmt, he } from '../locale/he'
import { formatHeaderDate } from '../lib/format'
import { useTenant } from '../tenant/TenantProvider'

const TITLES: Record<string, string> = {
  '/payments': he.nav.payments,
  '/customers': he.nav.customers,
  '/calendar': he.nav.calendar,
  '/analytics': he.nav.analytics,
  '/settings': he.nav.settings,
}

/**
 * Identical on every page (spec §6):
 * right (leading) — studio logo · centre — page title · left — date + settings.
 *
 * Settings lives here rather than as a sixth tab: the spec pins the bottom bar
 * to five, and a sixth would not survive 390px.
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

        <div className="flex shrink-0 items-center gap-1">
          <p className="text-end text-xs font-semibold leading-tight text-muted">
            {formatHeaderDate(today, tenant.timezone, tenant.locale)}
          </p>
          <Link
            to="/settings"
            aria-label={he.settings.open}
            aria-current={pathname === '/settings' ? 'page' : undefined}
            className={`grid size-11 shrink-0 place-items-center rounded-field ${
              pathname === '/settings' ? 'text-accent' : 'text-muted'
            }`}
          >
            <GearIcon />
          </Link>
        </div>
      </div>
    </header>
  )
}

function GearIcon() {
  return (
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
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 0 1-3.8 0V21a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 0 1 0-3.8h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 0 1 3.8 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 0 1 0 3.8H21a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  )
}
