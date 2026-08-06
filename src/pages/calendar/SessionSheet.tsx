import { useEffect, useMemo, useState } from 'react'
import { Button, ConfirmDialog, Field, Input, Loading, Select, Sheet, SearchInput } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { formatMoney, formatShortDate, formatTime } from '../../lib/format'
import { fromAgorot, toAgorot } from '../../lib/money'
import { useTenant } from '../../tenant/TenantProvider'
import {
  useBookCustomer,
  useCancelBooking,
  useCancelSession,
  useInstructors,
  useMarkAttendance,
  useSessionRegistrants,
  useUpdateSession,
} from '../../data/calendar'
import { filterCustomers, useCustomers } from '../../data/customers'
import type { Customer, Session } from '../../types/models'

/** §10 — tap a block: registrant list, mark attendance, edit, cancel
 *  (with the Hebrew confirm; editing never touches the series). */
export function SessionSheet({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const tenant = useTenant()
  const registrants = useSessionRegistrants(session?.id ?? null)
  const instructors = useInstructors()
  const customers = useCustomers()
  const update = useUpdateSession()
  const cancel = useCancelSession()
  const mark = useMarkAttendance()
  const book = useBookCustomer()
  const cancelBooking = useCancelBooking()

  const [editing, setEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [form, setForm] = useState({ time: '', instructorId: '', capacity: '', price: '', durationMinutes: '' })

  // add-registrant panel
  const [adding, setAdding] = useState(false)
  const [bookQuery, setBookQuery] = useState('')
  const [coverage, setCoverage] = useState<'auto' | 'cash' | 'card'>('auto')
  const bookMatches = useMemo(
    () => filterCustomers(customers.data ?? [], bookQuery).slice(0, 5),
    [customers.data, bookQuery],
  )
  const registeredIds = useMemo(
    () => new Set((registrants.data ?? []).filter((r) => r.registration.status !== 'cancelled').map((r) => r.registration.customerId)),
    [registrants.data],
  )
  const full = !!session && session.registeredCount >= session.capacity

  async function bookCustomer(c: Customer) {
    if (!session) return
    await book.mutateAsync({
      sessionId: session.id,
      customerId: c.id,
      singleMethod: coverage === 'auto' ? undefined : coverage,
    })
    setBookQuery('')
    setAdding(false)
  }

  useEffect(() => {
    if (session) {
      const dur = Math.round((session.endAt.toMillis() - session.startAt.toMillis()) / 60_000)
      setForm({
        time: formatTime(session.startAt, tenant.timezone, 'en-GB'),
        instructorId: session.instructorId ?? '',
        capacity: String(session.capacity),
        price: String(fromAgorot(session.price)),
        durationMinutes: String(dur),
      })
      setEditing(false)
      setAdding(false)
      setBookQuery('')
      setCoverage('auto')
    }
  }, [session, tenant.timezone])

  // only instructors PERMITTED for this class type are offered (spec §10)
  const allowedInstructors = useMemo(
    () =>
      (instructors.data ?? []).filter(
        (i) => i.active && session && i.allowedClassTypes.includes(session.classTypeId),
      ),
    [instructors.data, session],
  )

  const classTypeLabel = session
    ? tenant.classTypes.find((t) => t.id === session.classTypeId)?.labelHe ?? ''
    : ''

  return (
    <Sheet
      open={session !== null}
      onClose={onClose}
      title={session ? session.title : he.calendar.sessionDetails}
      subtitle={
        session
          ? `${classTypeLabel} · ${formatShortDate(session.startAt, tenant.timezone, tenant.locale)} · ${formatTime(session.startAt, tenant.timezone, tenant.locale)}`
          : undefined
      }
    >
      {session && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat
              value={`${session.registeredCount}/${session.capacity}`}
              label={he.calendar.capacity}
            />
            <MiniStat
              value={formatMoney(session.price, tenant.currency, tenant.locale)}
              label={he.calendar.price}
            />
            <MiniStat
              value={fmt(he.calendar.minutes, {
                n: Math.round((session.endAt.toMillis() - session.startAt.toMillis()) / 60_000),
              })}
              label={he.calendar.duration}
            />
          </div>

          {/* registrants + attendance */}
          <section>
            <div className="mb-2 flex items-center justify-between border-b border-hair pb-1.5">
              <h3 className="text-sm font-bold text-muted">{he.calendar.registrants}</h3>
              {!full && (
                <button type="button" className="text-xs font-bold text-accent" onClick={() => setAdding((v) => !v)}>
                  {adding ? he.common.cancel : `+ ${he.calendar.addRegistrant}`}
                </button>
              )}
            </div>

            {adding && (
              <div className="mb-3 flex flex-col gap-2 rounded-field border border-line bg-page/50 p-3">
                <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={he.calendar.coverage}>
                  {([
                    ['auto', he.calendar.coverageAuto],
                    ['cash', he.calendar.coverageSingleCash],
                    ['card', he.calendar.coverageSingleCard],
                  ] as const).map(([v, label]) => (
                    <label key={v} className="flex items-center gap-2 text-xs font-semibold">
                      <input type="radio" name="coverage" className="accent-[var(--t-accent)]" checked={coverage === v} onChange={() => setCoverage(v)} />
                      {label}
                    </label>
                  ))}
                </div>
                <SearchInput
                  placeholder={he.calendar.bookSearch}
                  value={bookQuery}
                  onChange={(e) => setBookQuery(e.target.value)}
                />
                {bookQuery.trim() && (
                  <div className="flex flex-col overflow-hidden rounded-field border border-line bg-surface">
                    {bookMatches.filter((c) => !registeredIds.has(c.id)).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={book.isPending}
                        onClick={() => bookCustomer(c)}
                        className="flex min-h-11 items-center justify-between gap-2 border-b border-hair px-3 text-start text-sm last:border-0 disabled:opacity-50"
                      >
                        <span className="truncate font-semibold">{c.firstName} {c.lastName}</span>
                        <span className="shrink-0 text-xs text-faint"><bdi>{c.phone}</bdi></span>
                      </button>
                    ))}
                    {bookMatches.filter((c) => !registeredIds.has(c.id)).length === 0 && (
                      <p className="px-3 py-3 text-center text-xs text-faint">{he.common.noResults}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {registrants.isLoading ? (
              <Loading />
            ) : (registrants.data ?? []).filter((r) => r.registration.status !== 'cancelled').length === 0 ? (
              <p className="text-sm text-faint">{he.calendar.noRegistrants}</p>
            ) : (
              <div className="flex flex-col">
                {(registrants.data ?? [])
                  .filter((r) => r.registration.status !== 'cancelled')
                  .map(({ registration, customer }) => (
                  <div key={registration.id} className="flex items-center justify-between gap-2 border-b border-hair py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {customer ? `${customer.firstName} ${customer.lastName}` : '—'}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <AttendButton
                        active={registration.status === 'attended'}
                        label={he.calendar.attended}
                        tone="ok"
                        onClick={() =>
                          mark.mutate({
                            registration,
                            status: registration.status === 'attended' ? 'booked' : 'attended',
                          })
                        }
                      />
                      <AttendButton
                        active={registration.status === 'noShow'}
                        label={he.calendar.noShow}
                        tone="warn"
                        onClick={() =>
                          mark.mutate({
                            registration,
                            status: registration.status === 'noShow' ? 'booked' : 'noShow',
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label={he.calendar.removeRegistrant}
                        onClick={() => cancelBooking.mutate({ registrationId: registration.id })}
                        className="grid size-9 place-items-center rounded-field border border-line text-faint"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* edit — this occurrence only */}
          <section>
            <div className="mb-2 flex items-center justify-between border-b border-hair pb-1.5">
              <h3 className="text-sm font-bold text-muted">{he.calendar.editSession}</h3>
              <button type="button" className="text-xs font-bold text-accent" onClick={() => setEditing((v) => !v)}>
                {editing ? he.common.cancel : he.common.edit}
              </button>
            </div>
            {session.recurrenceId && (
              <p className="mb-2 text-xs text-faint">{he.calendar.recurrenceNote}</p>
            )}
            {editing && (
              <form
                className="flex flex-col gap-3"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await update.mutateAsync({
                    session,
                    changes: {
                      time: form.time,
                      instructorId: form.instructorId,
                      capacity: Number(form.capacity),
                      price: toAgorot(form.price),
                      durationMinutes: Number(form.durationMinutes),
                    },
                  })
                  onClose()
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label={he.calendar.startTime}>
                    <Input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                  </Field>
                  <Field label={he.calendar.duration}>
                    <Input required type="number" min="10" step="5" dir="ltr" className="text-end tnum" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
                  </Field>
                </div>
                <Field label={he.calendar.instructor}>
                  <Select value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}>
                    <option value="">—</option>
                    {allowedInstructors.map((i) => (
                      <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={he.calendar.capacity}>
                    <Input required type="number" min="1" dir="ltr" className="text-end tnum" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
                  </Field>
                  <Field label={he.calendar.price}>
                    <Input required type="number" min="0" dir="ltr" className="text-end tnum" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  </Field>
                </div>
                <Button type="submit" disabled={update.isPending}>{he.common.save}</Button>
              </form>
            )}
          </section>

          <Button variant="ghost" className="text-crit" onClick={() => setConfirmCancel(true)}>
            {he.calendar.cancelSession}
          </Button>

          <ConfirmDialog
            open={confirmCancel}
            question={he.calendar.cancelConfirm}
            onNo={() => setConfirmCancel(false)}
            onYes={async () => {
              await cancel.mutateAsync(session)
              setConfirmCancel(false)
              onClose()
            }}
          />
        </>
      )}
    </Sheet>
  )
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-field border border-line bg-page/60 p-2.5">
      <span className="text-sm font-bold tnum"><bdi>{value}</bdi></span>
      <span className="text-[0.6875rem] font-semibold text-muted">{label}</span>
    </div>
  )
}

function AttendButton({ active, label, tone, onClick }: {
  active: boolean
  label: string
  tone: 'ok' | 'warn'
  onClick: () => void
}) {
  const activeClass = tone === 'ok' ? 'bg-ok text-white border-ok' : 'bg-warn text-white border-warn'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-field border px-2.5 text-xs font-bold ${
        active ? activeClass : 'border-line bg-surface text-muted'
      }`}
    >
      {label}
    </button>
  )
}
