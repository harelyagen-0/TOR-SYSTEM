import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState, Loading, SectionTitle, StatCard } from '../../components/ui'
import { he } from '../../locale/he'
import { dateKey, formatTime } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import { useInstructors, useSessionsForDay } from '../../data/calendar'
import { useMetrics } from '../../metrics/useMetrics'
import { SessionSheet } from '../calendar/SessionSheet'
import type { Session } from '../../types/models'

/**
 * §7 — quick actions (2×2, collection first), today's schedule in time order,
 * four analytics cards. Quick actions ROUTE to the relevant page with the
 * action already open — no modals on the home page.
 */
export function HomePage() {
  const tenant = useTenant()
  const navigate = useNavigate()
  const today = dateKey(new Date(), tenant.timezone)
  const sessions = useSessionsForDay(today)
  const instructors = useInstructors()
  const metrics = useMetrics()
  const [openSession, setOpenSession] = useState<Session | null>(null)

  const instructorName = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of instructors.data ?? []) m.set(i.id, `${i.firstName} ${i.lastName}`)
    return m
  }, [instructors.data])

  const todays = (sessions.data ?? []).filter((s) => s.status === 'scheduled')

  return (
    <div className="flex flex-col gap-5">
      {/* 1 · quick actions — the fourth trio is [OPEN]; spec suggestions used */}
      <section>
        <SectionTitle>{he.home.quickActions}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction primary label={he.home.qaCollect} onClick={() => navigate('/payments?action=collect')} icon={<CardIcon />} />
          <QuickAction label={he.home.qaAddCustomer} onClick={() => navigate('/customers?action=add')} icon={<PersonPlusIcon />} />
          <QuickAction label={he.home.qaAddSession} onClick={() => navigate('/calendar?action=add')} icon={<CalendarPlusIcon />} />
          <QuickAction label={he.home.qaAddExpense} onClick={() => navigate('/payments?action=expense')} icon={<ReceiptIcon />} />
        </div>
      </section>

      {/* 2 · today's schedule */}
      <section>
        <SectionTitle aside={he.common.today}>{he.home.todayTitle}</SectionTitle>
        {sessions.isLoading ? (
          <Loading />
        ) : todays.length === 0 ? (
          <EmptyState title={he.home.todayEmpty} />
        ) : (
          <Card className="!p-0">
            {todays.map((s) => {
              const type = tenant.classTypes.find((t) => t.id === s.classTypeId)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setOpenSession(s)}
                  className="flex w-full items-center gap-3 border-b border-hair p-3.5 text-start last:border-0"
                >
                  <span className="shrink-0 border-e border-hair pe-3 text-sm font-bold tnum">
                    <bdi>{formatTime(s.startAt, tenant.timezone, tenant.locale)}</bdi>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {s.title}
                      {type && <span className="ms-2 text-xs font-semibold text-faint">{type.labelHe}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {s.instructorId ? instructorName.get(s.instructorId) ?? '' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-bold tnum">
                      <bdi>{s.registeredCount}/{s.capacity}</bdi>
                    </span>
                    <span className="block text-[0.6875rem] font-semibold text-faint">
                      {he.calendar.capacity}
                    </span>
                  </span>
                </button>
              )
            })}
          </Card>
        )}
      </section>

      {/* 3 · four analytics cards → analytics page */}
      <section>
        <SectionTitle>{he.home.kpiTitle}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map(({ def, result, isLoading }) => (
            <StatCard
              key={def.id}
              label={def.label}
              value={isLoading ? '…' : result?.value ?? '—'}
              onClick={() => navigate('/analytics')}
            />
          ))}
        </div>
      </section>

      <SessionSheet session={openSession} onClose={() => setOpenSession(null)} />
    </div>
  )
}

function QuickAction({ label, onClick, icon, primary = false }: {
  label: string
  onClick: () => void
  icon: ReactNode
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 items-center gap-3 rounded-card border p-3.5 text-start shadow-sm transition-transform active:scale-[0.98] ${
        primary
          ? 'border-transparent bg-primary text-on-primary'
          : 'border-line bg-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-9 shrink-0 place-items-center rounded-field ${
          primary ? 'bg-white/15 text-on-primary' : 'bg-accent/10 text-accent'
        }`}
      >
        {icon}
      </span>
      <span className="text-sm font-bold leading-tight">{label}</span>
    </button>
  )
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-5',
  'aria-hidden': true,
} as const

function CardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M2.5 10.5h19M6.5 14.5h4" />
    </svg>
  )
}
function PersonPlusIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="10.5" cy="8" r="3.4" />
      <path d="M4 20.5c0-3.3 2.9-5.6 6.5-5.6 1.5 0 2.9.4 4 1.1M17.5 14.5v6M14.5 17.5h6" />
    </svg>
  )
}
function CalendarPlusIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5" />
    </svg>
  )
}
function ReceiptIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  )
}
