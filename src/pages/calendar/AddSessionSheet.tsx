import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Loading, OptionTile, Select, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { dateKey } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import {
  useCreateRecurrence,
  useCreateSession,
  useInstructors,
  useSaveTemplate,
  useTemplates,
} from '../../data/calendar'
import type { ClassTemplate } from '../../types/models'
import type { SlotTap } from './WeekGrid'
import { swallow } from '../../lib/errors'

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
  const createSession = useCreateSession()
  const createRecurrence = useCreateRecurrence()
  const saveTemplate = useSaveTemplate()

  const [mode, setMode] = useState<Mode>('pick')
  const [template, setTemplate] = useState<ClassTemplate | null>(null)
  const [recurring, setRecurring] = useState(false)
  const [endsOn, setEndsOn] = useState('')
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
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
      }).catch(swallow)
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
        }).catch(swallow)
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
      }).catch(swallow)
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
