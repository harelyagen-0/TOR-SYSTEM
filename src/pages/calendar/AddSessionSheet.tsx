import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Loading, OptionTile, Select, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { dateKey, formatMoney } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import {
  useCreateRecurrence,
  useCreateSession,
  useInstructors,
  useSaveTemplate,
  useTemplates,
} from '../../data/calendar'
import { useProducts } from '../../data/products'
import type { ClassTemplate } from '../../types/models'
import type { SlotTap } from './WeekGrid'

type Mode = 'pick' | 'pickTemplate' | 'template' | 'templateEdit' | 'new'

/**
 * §10 — tap a slot (or +): choose "מתבנית" or "שיעור חדש".
 * Template path asks "לערוך את התבנית?" — No creates the session exactly as
 * the template defines at the tapped time; Yes edits THIS occurrence only.
 * A template can also become a recurrence (weekly series, materialised).
 */
export function AddSessionSheet({
  open,
  slot,
  onClose,
}: {
  open: boolean
  slot: SlotTap | null
  onClose: () => void
}) {
  const tenant = useTenant()
  const templates = useTemplates()
  const instructors = useInstructors()
  const products = useProducts()
  const createSession = useCreateSession()
  const createRecurrence = useCreateRecurrence()
  const saveTemplate = useSaveTemplate()

  // only passes + subscriptions can "grant entry"; single entries are always paid
  const passProducts = useMemo(
    () => (products.data ?? []).filter((p) => p.kind === 'punchCard' || p.kind === 'subscription'),
    [products.data],
  )

  const [mode, setMode] = useState<Mode>('pick')
  const [template, setTemplate] = useState<ClassTemplate | null>(null)
  const [recurring, setRecurring] = useState(false)
  const [endsOn, setEndsOn] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
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
  const [form, setForm] = useState({
    title: '',
    classTypeId: tenant.classTypes[0]?.id ?? '',
    instructorId: '',
    date: '',
    time: '',
    durationMinutes: '60',
    capacity: '10',
    price: '50',
  })

  const today = dateKey(new Date(), tenant.timezone)

  useEffect(() => {
    if (open) {
      setMode('pick')
      setTemplate(null)
      setRecurring(false)
      setEndsOn('')
      setSaveAsTemplate(false)
      setAllowedIds(null)
      setProductsOpen(false)
      setForm((f) => ({
        ...f,
        title: '',
        date: slot?.date ?? today,
        time: slot?.time ?? '08:00',
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot])

  const allowedInstructors = useMemo(
    () =>
      (instructors.data ?? []).filter(
        (i) => i.active && i.allowedClassTypes.includes(form.classTypeId),
      ),
    [instructors.data, form.classTypeId],
  )

  function loadTemplate(t: ClassTemplate) {
    setTemplate(t)
    // an edited occurrence starts from the template's own entry rules
    setAllowedIds(t.allowedProductIds ?? null)
    setForm((f) => ({
      ...f,
      title: t.title,
      classTypeId: t.classTypeId,
      instructorId: t.defaultInstructorId ?? '',
      time: slot?.time ?? t.defaultStartTime ?? f.time,
      durationMinutes: String(t.durationMinutes),
      capacity: String(t.capacity),
      price: String(t.price),
    }))
    setMode('template')
  }

  const weekdayOfDate = useMemo(() => {
    // 0=Sunday index of the chosen date (calendar arithmetic, tz-safe)
    const [y, m, d] = form.date.split('-').map(Number)
    if (!y) return 0
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  }, [form.date])

  async function createFromForm(tpl: ClassTemplate | null) {
    if (recurring && tpl) {
      await createRecurrence.mutateAsync({
        template: tpl,
        weekday: weekdayOfDate,
        time: form.time,
        startsOn: form.date,
        endsOn: endsOn || undefined,
      })
    } else {
      let templateId = tpl?.id
      if (saveAsTemplate && !tpl) {
        await saveTemplate.mutateAsync({
          title: form.title,
          classTypeId: form.classTypeId,
          defaultInstructorId: form.instructorId || undefined,
          capacity: Number(form.capacity),
          durationMinutes: Number(form.durationMinutes),
          price: Number(form.price),
          defaultStartTime: form.time,
          allowedProductIds: allowedIds,
        })
      }
      await createSession.mutateAsync({
        title: form.title,
        classTypeId: form.classTypeId,
        instructorId: form.instructorId || undefined,
        date: form.date,
        time: form.time,
        durationMinutes: Number(form.durationMinutes),
        capacity: Number(form.capacity),
        price: Number(form.price),
        templateId,
        allowedProductIds: allowedIds,
      })
    }
    onClose()
  }

  const busy = createSession.isPending || createRecurrence.isPending || saveTemplate.isPending

  return (
    <Sheet open={open} onClose={onClose} title={he.calendar.addSession}>
      {mode === 'pick' && (
        <div className="flex flex-col gap-2">
          <OptionTile selected={false} onSelect={() => setMode('pickTemplate')} title={he.calendar.fromTemplate} />
          <OptionTile selected={false} onSelect={() => setMode('new')} title={he.calendar.newClass} />
        </div>
      )}

      {/* template list */}
      {mode === 'pickTemplate' && (
        <div className="flex flex-col gap-2">
          {templates.isLoading ? (
            <Loading />
          ) : (templates.data ?? []).length === 0 ? (
            <p className="text-sm text-faint">{he.calendar.templatesEmpty}</p>
          ) : (
            (templates.data ?? []).map((t) => (
              <OptionTile
                key={t.id}
                selected={false}
                onSelect={() => loadTemplate(t)}
                title={t.title}
                subtitle={`${tenant.classTypes.find((c) => c.id === t.classTypeId)?.labelHe ?? ''} · ${fmt(he.calendar.minutes, { n: t.durationMinutes })}`}
              />
            ))
          )}
        </div>
      )}

      {/* "לערוך את התבנית?" */}
      {mode === 'template' && template && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-bold">{he.calendar.editTemplatePrompt}</p>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-[var(--t-accent)]"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            {he.calendar.recurring}
            <span className="font-normal text-faint">{he.calendar.recurringExample}</span>
          </label>
          {recurring && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={he.calendar.startsOn}>
                <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label={he.calendar.endsOn}>
                <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </Field>
            </div>
          )}
          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" disabled={busy} onClick={() => createFromForm(template)}>
              {he.common.no}
            </Button>
            <Button disabled={busy} onClick={() => setMode('templateEdit')}>
              {he.common.yes}
            </Button>
          </div>
        </div>
      )}

      {/* full form — template-edit (this occurrence only) or brand new class */}
      {(mode === 'templateEdit' || mode === 'new') && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void createFromForm(mode === 'templateEdit' ? template : null)
          }}
        >
          <Field label={he.calendar.classTitle}>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.calendar.classType}>
              <Select
                value={form.classTypeId}
                onChange={(e) => setForm({ ...form, classTypeId: e.target.value, instructorId: '' })}
              >
                {tenant.classTypes.map((c) => (
                  <option key={c.id} value={c.id}>{c.labelHe}</option>
                ))}
              </Select>
            </Field>
            <Field label={he.calendar.instructor}>
              <Select value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}>
                <option value="">—</option>
                {allowedInstructors.map((i) => (
                  <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.calendar.date}>
              <Input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={he.calendar.startTime}>
              <Input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={he.calendar.duration}>
              <Input required type="number" min="10" step="5" dir="ltr" className="text-end tnum" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
            </Field>
            <Field label={he.calendar.capacity}>
              <Input required type="number" min="1" dir="ltr" className="text-end tnum" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </Field>
            <Field label={he.calendar.price}>
              <Input required type="number" min="0" dir="ltr" className="text-end tnum" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
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

          {mode === 'new' && (
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-[var(--t-accent)]"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
              />
              {he.calendar.saveAsTemplate}
            </label>
          )}
          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
            <Button type="submit" disabled={busy}>{he.common.save}</Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
