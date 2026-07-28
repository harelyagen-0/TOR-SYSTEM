import { useEffect, useMemo, useState } from 'react'
import { Button, ConfirmDialog, Field, Input, Loading, Select, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { formatMoney, formatShortDate, formatTime } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import {
  HOLDS_SEAT,
  useCancelSession,
  useInstructors,
  useMarkAttendance,
  useSessionRegistrants,
  useUpdateSession,
} from '../../data/calendar'
import { useProducts } from '../../data/products'
import type { Session } from '../../types/models'
import { swallow } from '../../lib/errors'

/** §10 — tap a block: registrant list, mark attendance, edit, cancel
 *  (with the Hebrew confirm; editing never touches the series). */
export function SessionSheet({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const tenant = useTenant()
  const registrants = useSessionRegistrants(session?.id ?? null)
  const instructors = useInstructors()
  const products = useProducts()
  const update = useUpdateSession()
  const cancel = useCancelSession()
  const mark = useMarkAttendance()

  const [editing, setEditing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [form, setForm] = useState({ time: '', instructorId: '', capacity: '', price: '', durationMinutes: '' })

  useEffect(() => {
    if (session) {
      const dur = Math.round((session.endAt.toMillis() - session.startAt.toMillis()) / 60_000)
      setForm({
        time: formatTime(session.startAt, tenant.timezone, 'en-GB'),
        instructorId: session.instructorId ?? '',
        capacity: String(session.capacity),
        price: String(session.price),
        durationMinutes: String(dur),
      })
      setEditing(false)
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

  // seats taken = the registrant rows already loaded here, minus cancellations
  const seatsTaken = (registrants.data ?? []).filter((r) =>
    HOLDS_SEAT.includes(r.registration.status),
  ).length

  // passes / subscriptions that admit to THIS class type — derived from each
  // product's allowedClassTypeIds, so editing a product updates this at once
  const entryProducts = useMemo(
    () =>
      (products.data ?? []).filter(
        (p) =>
          (p.kind === 'punchCard' || p.kind === 'subscription') &&
          session != null &&
          (p.allowedClassTypeIds == null || p.allowedClassTypeIds.includes(session.classTypeId)),
      ),
    [products.data, session],
  )

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
              value={`${seatsTaken}/${session.capacity}`}
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

          {/* which passes / subscriptions admit to this class */}
          <section>
            <h3 className="mb-2 border-b border-hair pb-1.5 text-sm font-bold text-muted">
              {he.calendar.entryProducts}
            </h3>
            {entryProducts.length === 0 ? (
              <p className="text-sm text-faint">{he.calendar.entryProductsNone}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {entryProducts.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-md border border-line bg-page/60 px-2 py-1 text-xs font-semibold"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* registrants + attendance */}
          <section>
            <h3 className="mb-2 border-b border-hair pb-1.5 text-sm font-bold text-muted">
              {he.calendar.registrants}
            </h3>
            {registrants.isLoading ? (
              <Loading />
            ) : (registrants.data ?? []).length === 0 ? (
              <p className="text-sm text-faint">{he.calendar.noRegistrants}</p>
            ) : (
              <div className="flex flex-col">
                {(registrants.data ?? []).map(({ registration, customer }) => (
                  <div key={registration.id} className="flex items-center justify-between gap-2 border-b border-hair py-2 last:border-0">
                    <span className="min-w-0 truncate text-sm font-semibold">
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
                      price: Number(form.price),
                      durationMinutes: Number(form.durationMinutes),
                    },
                  }).catch(swallow)
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
              await cancel.mutateAsync(session).catch(swallow)
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
