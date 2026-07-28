import { useMemo, useState, type MouseEvent } from 'react'
import { addDaysKey, dateKey, formatMoney, tzParts, weekdayName } from '../../lib/format'
import { fmt, he } from '../../locale/he'
import { ConfirmDialog } from '../../components/ui'
import { useTenant } from '../../tenant/TenantProvider'
import { useCancelSession, useInstructors, useSessionSeatCounts } from '../../data/calendar'
import type { Session } from '../../types/models'
import { swallow } from '../../lib/errors'

const HOUR_PX = 44

export interface SlotTap {
  date: string // 'YYYY-MM-DD'
  time: string // 'HH:mm', rounded to half hours
}

/**
 * Google-Calendar-like week view (spec §10): columns Sunday→Saturday, rows are
 * hours, block height ∝ duration. Overlapping sessions split the column width
 * evenly (2/3/4 side by side) via greedy interval-cluster column assignment.
 */
export function WeekGrid({
  weekStart,
  sessions,
  onTapSession,
  onTapSlot,
}: {
  weekStart: string
  sessions: Session[]
  onTapSession: (s: Session) => void
  onTapSlot: (slot: SlotTap) => void
}) {
  const tenant = useTenant()
  const tz = tenant.timezone
  const todayKey = dateKey(new Date(), tz)
  const cancel = useCancelSession()
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null)
  // seats taken, counted from the registrations themselves
  const seats = useSessionSeatCounts(sessions.map((s) => s.id))
  const instructors = useInstructors()
  const instructorName = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of instructors.data ?? []) m.set(i.id, `${i.firstName} ${i.lastName}`)
    return m
  }, [instructors.data])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i)),
    [weekStart],
  )

  const active = useMemo(
    () => sessions.filter((s) => s.status === 'scheduled'),
    [sessions],
  )

  // visible hour range: 07:00–22:00, stretched by actual content
  const [dayStartHour, dayEndHour] = useMemo(() => {
    let min = 7
    let max = 22
    for (const s of active) {
      const p = tzParts(s.startAt.toDate(), tz)
      const e = tzParts(s.endAt.toDate(), tz)
      min = Math.min(min, p.hour)
      max = Math.max(max, e.hour + (e.minute > 0 ? 1 : 0))
    }
    return [min, max]
  }, [active, tz])
  const gridHeight = (dayEndHour - dayStartHour) * HOUR_PX

  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const d of days) map.set(d, [])
    for (const s of active) {
      const key = dateKey(s.startAt, tz)
      map.get(key)?.push(s)
    }
    return map
  }, [active, days, tz])

  const classTypeColor = (id: string) =>
    tenant.classTypes.find((t) => t.id === id)?.color ?? tenant.theme.accent

  function tapSlot(e: MouseEvent<HTMLDivElement>, date: string) {
    // ignore taps that land on a session block (it handles itself)
    if ((e.target as HTMLElement).closest('[data-session]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMinutes = dayStartHour * 60 + Math.round((y / HOUR_PX) * 60)
    const rounded = Math.round(totalMinutes / 30) * 30
    const hh = String(Math.floor(rounded / 60)).padStart(2, '0')
    const mm = String(rounded % 60).padStart(2, '0')
    onTapSlot({ date, time: `${hh}:${mm}` })
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      {/* day header row */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: '2rem repeat(7, 1fr)' }}>
        <span aria-hidden="true" />
        {days.map((d, i) => {
          const [, , dayNum] = d.split('-')
          const isToday = d === todayKey
          return (
            <div key={d} className="flex flex-col items-center gap-0.5 py-1.5">
              <span className="text-[0.625rem] font-semibold text-faint">{weekdayName(i)}</span>
              <span
                className={`grid size-5.5 place-items-center rounded-full text-[0.6875rem] font-bold tnum ${
                  isToday ? 'bg-accent text-on-primary' : 'text-ink'
                }`}
              >
                {Number(dayNum)}
              </span>
            </div>
          )
        })}
      </div>

      {/* hour gutter + 7 day columns */}
      <div className="grid" style={{ gridTemplateColumns: '2rem repeat(7, 1fr)' }}>
        <div className="relative border-e border-hair" style={{ height: gridHeight }} aria-hidden="true">
          {Array.from({ length: dayEndHour - dayStartHour }, (_, i) => (
            <span
              key={i}
              className="absolute end-0.5 -translate-y-1/2 text-[0.5625rem] font-semibold text-faint tnum"
              style={{ top: (i + 1) * HOUR_PX }}
            >
              {String(dayStartHour + i + 1).padStart(2, '0')}
            </span>
          ))}
        </div>

        {days.map((d) => {
          const daySessions = byDay.get(d) ?? []
          const layout = layoutDay(daySessions)
          return (
            <div
              key={d}
              className="relative border-e border-hair last:border-e-0"
              style={{ height: gridHeight }}
              onClick={(e) => tapSlot(e, d)}
            >
              {/* hour lines */}
              {Array.from({ length: dayEndHour - dayStartHour - 1 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 border-b border-hair"
                  style={{ top: (i + 1) * HOUR_PX }}
                />
              ))}

              {daySessions.map((s) => {
                const p = tzParts(s.startAt.toDate(), tz)
                const startMin = p.hour * 60 + p.minute
                const durMin = Math.round((s.endAt.toMillis() - s.startAt.toMillis()) / 60_000)
                const top = ((startMin - dayStartHour * 60) / 60) * HOUR_PX
                const height = Math.max(22, (durMin / 60) * HOUR_PX)
                const pos = layout.get(s.id) ?? { col: 0, cols: 1 }
                const widthPct = 100 / pos.cols
                const color = classTypeColor(s.classTypeId)
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    data-session
                    onClick={() => onTapSession(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onTapSession(s)
                      }
                    }}
                    className="absolute cursor-pointer overflow-hidden rounded-md border p-0.5 text-start leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{
                      top,
                      height,
                      insetInlineStart: `${pos.col * widthPct}%`,
                      width: `calc(${widthPct}% - 2px)`,
                      background: `color-mix(in srgb, ${color} 14%, var(--t-surface))`,
                      borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                    }}
                    aria-label={s.title}
                  >
                    {/* delete — small red × at the physical top-right corner */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDelete(s)
                      }}
                      aria-label={he.calendar.deleteClass}
                      className="absolute right-0 top-0 z-10 grid size-3.5 place-items-center rounded-bl-md rounded-tr-md bg-crit text-[0.625rem] font-bold leading-none text-white"
                    >
                      ×
                    </button>
                    <span className="block truncate ps-3.5 text-[0.5625rem] font-bold">{s.title}</span>
                    {height >= 40 && s.instructorId && (
                      <span className="block truncate text-[0.5rem] text-muted">
                        {instructorName.get(s.instructorId) ?? ''}
                      </span>
                    )}
                    {height >= 56 && (
                      <span className="block truncate text-[0.5rem] text-faint tnum">
                        <bdi>{formatMoney(s.price, tenant.currency, tenant.locale)}</bdi>
                        {' · '}
                        <bdi>{fmt(he.calendar.minutes, { n: durMin })}</bdi>
                      </span>
                    )}
                    {/* registered/capacity — physical bottom-left (spec §10) */}
                    <span className="absolute bottom-0.5 left-1 text-[0.5625rem] font-bold tnum">
                      <bdi>{seats.data?.get(s.id) ?? 0}/{s.capacity}</bdi>
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        question={he.calendar.deleteClassConfirm}
        onNo={() => setPendingDelete(null)}
        onYes={async () => {
          if (pendingDelete) await cancel.mutateAsync(pendingDelete).catch(swallow)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

/** Greedy interval clustering: sessions that overlap share the column width
 *  evenly; independent sessions keep the full width. */
function layoutDay(sessions: Session[]): Map<string, { col: number; cols: number }> {
  const result = new Map<string, { col: number; cols: number }>()
  const sorted = [...sessions].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())

  let cluster: Session[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    const colEnds: number[] = []
    const assigned = new Map<string, number>()
    for (const s of cluster) {
      let col = colEnds.findIndex((end) => end <= s.startAt.toMillis())
      if (col === -1) {
        col = colEnds.length
        colEnds.push(0)
      }
      colEnds[col] = s.endAt.toMillis()
      assigned.set(s.id, col)
    }
    for (const s of cluster) {
      result.set(s.id, { col: assigned.get(s.id)!, cols: colEnds.length })
    }
    cluster = []
  }

  for (const s of sorted) {
    if (s.startAt.toMillis() >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    cluster.push(s)
    clusterEnd = Math.max(clusterEnd, s.endAt.toMillis())
  }
  flush()
  return result
}
