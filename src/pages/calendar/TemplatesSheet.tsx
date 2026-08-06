import { useMemo, useState, type FormEvent } from 'react'
import { Button, EmptyState, Field, Input, Loading, Select, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { dateKey, formatMoney, weekdayName } from '../../lib/format'
import { fromAgorot, toAgorot } from '../../lib/money'
import { useTenant } from '../../tenant/TenantProvider'
import { useCreateRecurrence, useDeleteTemplate, useInstructors, useRecurrences, useSaveTemplate, useTemplates } from '../../data/calendar'
import { useProducts } from '../../data/products'
import type { ClassTemplate } from '../../types/models'

/** §10 bottom button 1 — manage class templates: title, class type,
 *  instructor, capacity, duration, price, default start time. */
export function TemplatesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const templates = useTemplates()
  const instructors = useInstructors()
  const products = useProducts()
  const save = useSaveTemplate()
  const del = useDeleteTemplate()
  const recurrences = useRecurrences()
  const createRecurrence = useCreateRecurrence()

  // only passes + subscriptions can "grant entry"; single entries are always paid
  const passProducts = useMemo(
    () => (products.data ?? []).filter((p) => p.kind === 'punchCard' || p.kind === 'subscription'),
    [products.data],
  )

  const today = dateKey(new Date(), tenant.timezone)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [recurring, setRecurring] = useState(false)
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState('')
  // null = every pass/subscription grants entry (default); a list restricts it
  const [allowedIds, setAllowedIds] = useState<string[] | null>(null)
  const [productsOpen, setProductsOpen] = useState(false)

  const isAllowed = (id: string) => allowedIds === null || allowedIds.includes(id)
  function toggleAllowed(id: string) {
    const all = passProducts.map((p) => p.id)
    let next = allowedIds === null ? [...all] : [...allowedIds]
    next = next.includes(id) ? next.filter((x) => x !== id) : [...next, id]
    // collapse back to "all" (null) when nothing is excluded — future-proof
    setAllowedIds(next.length === all.length && all.every((x) => next.includes(x)) ? null : next)
  }
  const empty = {
    title: '',
    classTypeId: tenant.classTypes[0]?.id ?? '',
    defaultInstructorId: '',
    capacity: '10',
    durationMinutes: '60',
    price: '50',
    defaultStartTime: '08:00',
    room: '',
  }
  const [form, setForm] = useState(empty)

  // a recurrence repeats weekly on the weekday of its start date (tz-safe)
  const weekday = useMemo(() => {
    const [y, m, d] = startsOn.split('-').map(Number)
    if (!y) return 0
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  }, [startsOn])

  const allowedInstructors = useMemo(
    () =>
      (instructors.data ?? []).filter(
        (i) => i.active && i.allowedClassTypes.includes(form.classTypeId),
      ),
    [instructors.data, form.classTypeId],
  )

  function startEdit(t: ClassTemplate | null) {
    // recurrence is always opt-in and reset per open — never a default
    setRecurring(false)
    setStartsOn(today)
    setEndsOn('')
    setProductsOpen(false)
    setAllowedIds(t?.allowedProductIds ?? null)
    if (t) {
      setEditingId(t.id)
      setForm({
        title: t.title,
        classTypeId: t.classTypeId,
        defaultInstructorId: t.defaultInstructorId ?? '',
        capacity: String(t.capacity),
        durationMinutes: String(t.durationMinutes),
        price: String(fromAgorot(t.price)),
        defaultStartTime: t.defaultStartTime ?? '08:00',
        room: t.room ?? '',
      })
    } else {
      setEditingId('new')
      setForm(empty)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const savedId = await save.mutateAsync({
      id: editingId === 'new' ? undefined : editingId!,
      title: form.title,
      classTypeId: form.classTypeId,
      defaultInstructorId: form.defaultInstructorId || undefined,
      capacity: Number(form.capacity),
      durationMinutes: Number(form.durationMinutes),
      price: toAgorot(form.price),
      defaultStartTime: form.defaultStartTime,
      room: form.room || undefined,
      allowedProductIds: allowedIds,
    })
    // opt-in: also schedule the template as a weekly recurring class — only on
    // CREATE, so editing a template never spawns a duplicate series (P3-5)
    if (recurring && startsOn && editingId === 'new') {
      await createRecurrence.mutateAsync({
        template: {
          id: savedId,
          title: form.title,
          classTypeId: form.classTypeId,
          defaultInstructorId: form.defaultInstructorId || undefined,
          capacity: Number(form.capacity),
          durationMinutes: Number(form.durationMinutes),
          price: toAgorot(form.price),
          defaultStartTime: form.defaultStartTime,
          room: form.room || undefined,
        },
        weekday,
        time: form.defaultStartTime,
        startsOn,
        endsOn: endsOn || undefined,
      })
    }
    setEditingId(null)
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.calendar.templatesTitle}>
      {editingId === null ? (
        <>
          {templates.isLoading ? (
            <Loading />
          ) : (templates.data ?? []).length === 0 ? (
            <EmptyState title={he.calendar.templatesEmpty} />
          ) : (
            <div className="flex flex-col">
              {(templates.data ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => startEdit(t)}
                  className="flex items-center justify-between gap-3 border-b border-hair py-3 text-start last:border-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{t.title}</span>
                    <span className="block text-xs text-faint">
                      {tenant.classTypes.find((c) => c.id === t.classTypeId)?.labelHe ?? ''}
                      {' · '}
                      {fmt(he.calendar.minutes, { n: t.durationMinutes })}
                      {t.defaultStartTime && <> · <bdi className="tnum">{t.defaultStartTime}</bdi></>}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tnum">
                    <bdi>{formatMoney(t.price, tenant.currency, tenant.locale)}</bdi>
                  </span>
                </button>
              ))}
            </div>
          )}
          <Button onClick={() => startEdit(null)}>{he.calendar.newTemplate}</Button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label={he.calendar.classTitle}>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.calendar.classType}>
              <Select
                value={form.classTypeId}
                onChange={(e) => setForm({ ...form, classTypeId: e.target.value, defaultInstructorId: '' })}
              >
                {tenant.classTypes.map((c) => (
                  <option key={c.id} value={c.id}>{c.labelHe}</option>
                ))}
              </Select>
            </Field>
            <Field label={he.calendar.instructor}>
              <Select value={form.defaultInstructorId} onChange={(e) => setForm({ ...form, defaultInstructorId: e.target.value })}>
                <option value="">—</option>
                {allowedInstructors.map((i) => (
                  <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={he.calendar.capacity}>
              <Input required type="number" min="1" dir="ltr" className="text-end tnum" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </Field>
            <Field label={he.calendar.duration}>
              <Input required type="number" min="10" step="5" dir="ltr" className="text-end tnum" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
            </Field>
            <Field label={he.calendar.price}>
              <Input required type="number" min="0" dir="ltr" className="text-end tnum" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.calendar.defaultStartTime}>
              <Input required={recurring} type="time" value={form.defaultStartTime} onChange={(e) => setForm({ ...form, defaultStartTime: e.target.value })} />
            </Field>
            <Field label={`${he.calendar.room} ${he.common.optional}`}>
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </Field>
          </div>

          {/* which passes / subscriptions grant entry to this class — default: all */}
          <div>
            <button
              type="button"
              aria-expanded={productsOpen}
              onClick={() => setProductsOpen((v) => !v)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-field border border-line bg-surface px-3.5 text-start"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold">{he.calendar.allowedProducts}</span>
                <span className="truncate text-xs text-faint">
                  {passProducts.length === 0
                    ? he.calendar.allowedProductsNone
                    : allowedIds === null
                      ? he.calendar.allowedProductsAll
                      : fmt(he.calendar.allowedProductsSome, { n: allowedIds.length, total: passProducts.length })}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`shrink-0 text-faint transition-transform ${productsOpen ? 'rotate-180' : ''}`}
              >
                ▾
              </span>
            </button>

            {productsOpen && passProducts.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 rounded-field border border-line bg-page/60 p-2">
                {passProducts.map((p) => (
                  <label key={p.id} className="flex min-h-10 items-center gap-3 rounded-md px-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--t-accent)]"
                      checked={isAllowed(p.id)}
                      onChange={() => toggleAllowed(p.id)}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs text-faint tnum">
                      <bdi>{formatMoney(p.price, tenant.currency, tenant.locale)}</bdi>
                    </span>
                  </label>
                ))}
                <p className="px-1.5 pt-1 text-xs text-faint">{he.calendar.allowedProductsHint}</p>
              </div>
            )}
          </div>

          {/* opt-in: turn this template into a weekly recurring class — create only */}
          {editingId === 'new' && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={recurring}
                onClick={() => setRecurring((v) => !v)}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-field border px-3.5 text-start transition-colors ${
                  recurring ? 'border-accent bg-accent/5' : 'border-line bg-surface'
                }`}
              >
                <span className="flex flex-col">
                  <span className="text-sm font-bold">{he.calendar.makeRecurring}</span>
                  <span className="text-xs text-faint">{he.calendar.makeRecurringHint}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${recurring ? 'bg-accent' : 'bg-line'}`}
                >
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${recurring ? 'start-0.5' : 'start-[1.125rem]'}`} />
                </span>
              </button>

              {recurring && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={he.calendar.startsOn}>
                      <Input required type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                    </Field>
                    <Field label={he.calendar.endsOn}>
                      <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                    </Field>
                  </div>
                  <p className="-mt-1 text-xs text-faint">
                    {fmt(he.calendar.recurringSummary, { day: weekdayName(weekday), time: form.defaultStartTime })}
                  </p>
                </>
              )}
            </>
          )}

          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={() => setEditingId(null)}>{he.common.cancel}</Button>
            <Button type="submit" disabled={save.isPending || createRecurrence.isPending}>{he.common.save}</Button>
          </div>

          {/* delete — blocked while a recurring series still references it (P3-5) */}
          {editingId !== 'new' && (() => {
            const referenced = (recurrences.data ?? []).some((r) => r.templateId === editingId && !r.endsOn)
            return (
              <div className="border-t border-hair pt-3">
                {referenced && <p className="mb-2 text-xs text-warn">{he.calendar.templateInUse}</p>}
                <Button
                  variant="ghost"
                  className="w-full text-crit"
                  disabled={referenced || del.isPending}
                  onClick={async () => {
                    if (editingId) { await del.mutateAsync(editingId); setEditingId(null) }
                  }}
                >
                  {he.calendar.deleteTemplate}
                </Button>
              </div>
            )
          })()}
        </form>
      )}
    </Sheet>
  )
}
