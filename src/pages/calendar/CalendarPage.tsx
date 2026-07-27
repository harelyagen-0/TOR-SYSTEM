import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Loading } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { addDaysKey, weekRangeLabel, weekStartKey } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import { useSessionsForWeek } from '../../data/calendar'
import { WeekGrid, type SlotTap } from './WeekGrid'
import { SessionSheet } from './SessionSheet'
import { AddSessionSheet } from './AddSessionSheet'
import { TemplatesSheet } from './TemplatesSheet'
import { InstructorsSheet } from './InstructorsSheet'
import type { Session } from '../../types/models'

/**
 * §10 — always a full Sunday→Saturday week. The week navigation control sits
 * at the physical top-LEFT (the trailing corner in RTL) labelled with the
 * range, and the date-jump input reaches any week months ahead.
 */
export function CalendarPage() {
  const tenant = useTenant()
  const [weekStart, setWeekStart] = useState(() => weekStartKey(new Date(), tenant.timezone))
  const sessions = useSessionsForWeek(weekStart)

  const [openSession, setOpenSession] = useState<Session | null>(null)
  const [slot, setSlot] = useState<SlotTap | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [instructorsOpen, setInstructorsOpen] = useState(false)

  const currentWeek = weekStartKey(new Date(), tenant.timezone)
  const [params, setParams] = useSearchParams()

  // deep link from Home: /calendar?action=add
  useEffect(() => {
    if (params.get('action') === 'add') {
      setSlot(null)
      setAddOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  return (
    <div className="flex flex-col gap-4">
      {/* week navigation — range label leads (start side), controls at the physical left */}
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-bold">
          {fmt(he.calendar.weekOf, { range: '' })}
          <bdi className="tnum">{weekRangeLabel(weekStart)}</bdi>
        </p>
        {weekStart !== currentWeek && (
          <button
            type="button"
            onClick={() => setWeekStart(currentWeek)}
            className="min-h-11 shrink-0 rounded-field px-2 text-xs font-bold text-accent"
          >
            {he.common.today}
          </button>
        )}
        <NavArrow
          label={he.calendar.prevWeek}
          dir="next" // RTL: previous week points to the physical right
          onClick={() => setWeekStart(addDaysKey(weekStart, -7))}
        />
        <NavArrow
          label={he.calendar.nextWeek}
          dir="prev"
          onClick={() => setWeekStart(addDaysKey(weekStart, 7))}
        />
        {/* jump many weeks ahead (10+) via a date picker */}
        <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-field border border-line bg-surface text-muted">
          <span className="sr-only">{he.calendar.jumpWeeks}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4.5" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M8 3v4M16 3v4M3.5 10h17M12 14l3 3-3 3" />
          </svg>
          <input
            type="date"
            aria-label={he.calendar.jumpWeeks}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(e) => {
              if (e.target.value) {
                setWeekStart(weekStartKey(new Date(`${e.target.value}T12:00:00`), tenant.timezone))
              }
            }}
          />
        </label>
        <button
          type="button"
          aria-label={he.calendar.addSession}
          onClick={() => { setSlot(null); setAddOpen(true) }}
          className="grid size-11 shrink-0 place-items-center rounded-field bg-primary text-on-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {sessions.isLoading ? (
        <Loading />
      ) : (
        <WeekGrid
          weekStart={weekStart}
          sessions={sessions.data ?? []}
          onTapSession={setOpenSession}
          onTapSlot={(s) => { setSlot(s); setAddOpen(true) }}
        />
      )}

      {/* bottom-of-page management buttons (spec §10) */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={() => setTemplatesOpen(true)}>{he.calendar.manageTemplates}</Button>
        <Button variant="ghost" onClick={() => setInstructorsOpen(true)}>{he.calendar.manageInstructors}</Button>
      </div>

      <SessionSheet session={openSession} onClose={() => setOpenSession(null)} />
      <AddSessionSheet open={addOpen} slot={slot} onClose={() => setAddOpen(false)} />
      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <InstructorsSheet open={instructorsOpen} onClose={() => setInstructorsOpen(false)} />
    </div>
  )
}

function NavArrow({ label, dir, onClick }: { label: string; dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-field border border-line bg-surface text-muted"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
        {dir === 'next' ? <path d="M10 6l6 6-6 6" /> : <path d="M14 6l-6 6 6 6" />}
      </svg>
    </button>
  )
}
