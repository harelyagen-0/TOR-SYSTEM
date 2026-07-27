import { useState, type FormEvent } from 'react'
import { Button, EmptyState, Field, Input, Loading, Sheet } from '../../components/ui'
import { he } from '../../locale/he'
import { useTenant } from '../../tenant/TenantProvider'
import { useInstructors, useSaveInstructor } from '../../data/calendar'
import type { Instructor } from '../../types/models'

/**
 * §10 bottom button 2 — instructors: name, experience, and the POSITIVE list
 * of class types they may teach. An instructor certified for yoga but not
 * meditation simply doesn't have meditation checked — and is never offered
 * for meditation sessions anywhere in the app.
 */
export function InstructorsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const instructors = useInstructors()
  const save = useSaveInstructor()

  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const empty = { firstName: '', lastName: '', experience: '', phone: '', allowed: [] as string[] }
  const [form, setForm] = useState(empty)

  function startEdit(i: Instructor | null) {
    if (i) {
      setEditingId(i.id)
      setForm({
        firstName: i.firstName,
        lastName: i.lastName,
        experience: i.experience ?? '',
        phone: i.phone ?? '',
        allowed: [...i.allowedClassTypes],
      })
    } else {
      setEditingId('new')
      setForm(empty)
    }
  }

  function toggleType(id: string) {
    setForm((f) => ({
      ...f,
      allowed: f.allowed.includes(id) ? f.allowed.filter((x) => x !== id) : [...f.allowed, id],
    }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync({
      id: editingId === 'new' ? undefined : editingId!,
      firstName: form.firstName,
      lastName: form.lastName,
      experience: form.experience,
      phone: form.phone,
      allowedClassTypes: form.allowed,
    })
    setEditingId(null)
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.calendar.instructorsTitle}>
      {editingId === null ? (
        <>
          {instructors.isLoading ? (
            <Loading />
          ) : (instructors.data ?? []).length === 0 ? (
            <EmptyState title={he.calendar.instructorsEmpty} />
          ) : (
            <div className="flex flex-col">
              {(instructors.data ?? []).map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => startEdit(i)}
                  className="flex items-center gap-3 border-b border-hair py-3 text-start last:border-0"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent"
                  >
                    {i.firstName.charAt(0)}
                    {i.lastName.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{i.firstName} {i.lastName}</span>
                    <span className="block truncate text-xs text-faint">
                      {i.allowedClassTypes
                        .map((id) => tenant.classTypes.find((c) => c.id === id)?.labelHe)
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <Button onClick={() => startEdit(null)}>{he.calendar.newInstructor}</Button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.payments.firstName}>
              <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label={he.payments.lastName}>
              <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label={`${he.calendar.experience} ${he.common.optional}`}>
            <Input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
          </Field>
          <Field label={`${he.payments.phone} ${he.common.optional}`}>
            <Input type="tel" dir="ltr" className="text-end" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">{he.calendar.allowedTypes}</legend>
            <p className="mb-2 text-xs text-faint">{he.calendar.allowedTypesHint}</p>
            <div className="flex flex-col gap-1.5">
              {tenant.classTypes.map((c) => (
                <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-field border border-line px-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--t-accent)]"
                    checked={form.allowed.includes(c.id)}
                    onChange={() => toggleType(c.id)}
                  />
                  {c.labelHe}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={() => setEditingId(null)}>{he.common.cancel}</Button>
            <Button type="submit" disabled={save.isPending}>{he.common.save}</Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
