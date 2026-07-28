import type { ReactElement } from 'react'
import { NavLink } from 'react-router-dom'
import { he } from '../locale/he'
import { useAuth } from '../auth/AuthProvider'
import type { PermissionArea } from '../auth/permissions'

/**
 * The five-tab bar, identical on all pages. DOM order is the RTL visual
 * order right→left: בית · תשלומים · אנליטיקס · יומן · לקוחות (spec §6).
 *
 * Tabs an operator can't view are dropped rather than shown-and-blocked, so a
 * staff member sees a coherent app instead of doors that refuse to open. Home
 * has no `areas` — it is everyone's landing page and degrades on its own.
 */
const TABS: Array<{
  to: string
  label: string
  icon: (p: IconProps) => ReactElement
  areas?: PermissionArea[]
}> = [
  { to: '/', label: he.nav.home, icon: HomeIcon },
  { to: '/payments', label: he.nav.payments, icon: PaymentsIcon, areas: ['payments', 'finance'] },
  { to: '/analytics', label: he.nav.analytics, icon: AnalyticsIcon, areas: ['analytics'] },
  { to: '/calendar', label: he.nav.calendar, icon: CalendarIcon, areas: ['calendar'] },
  { to: '/customers', label: he.nav.customers, icon: CustomersIcon, areas: ['customers'] },
]

export function BottomNav() {
  const { can } = useAuth()
  const tabs = TABS.filter((t) => !t.areas || t.areas.some((a) => can(a, 'view')))

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* the column count is dynamic, so it can't be a Tailwind grid-cols-N class */}
      <div
        className="mx-auto grid w-full max-w-xl"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold ${
                isActive ? 'text-accent' : 'text-faint'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`size-6 ${isActive ? 'stroke-[2]' : 'stroke-[1.75]'}`} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

type IconProps = { className?: string }
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function HomeIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-4.2v-5.6H9.2V21H5a1 1 0 0 1-1-1z" />
    </svg>
  )
}
function PaymentsIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M2.5 10.5h19M6.5 14.5h4" />
    </svg>
  )
}
function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M4 20v-6.5M9.3 20V8.5M14.7 20v-4M20 20V4.5" />
    </svg>
  )
}
function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  )
}
function CustomersIcon({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="9.2" cy="8.4" r="3.3" />
      <path d="M3.2 20.3c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16.2 5.5a3.3 3.3 0 0 1 0 5.9M17.6 15.2c1.9.7 3.2 2.4 3.2 5.1" />
    </svg>
  )
}
