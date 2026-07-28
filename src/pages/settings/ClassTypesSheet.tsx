import { useEffect, useState, type FormEvent } from 'react'
import { Button, ConfirmDialog, EmptyState, Field, Input, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { useTenant } from '../../tenant/TenantProvider'
import { useUpdateTenant } from '../../data/settings'
import { useCan } from '../../auth/AuthProvider'
import { useTemplates } from '../../data/calendar'
import type { ClassType } from '../../types/models'

/** Slug for a new type id; ids are referenced by templates and sessions. */
function makeId(existing: ClassType[]): string {
  let n = existing.length + 1
  while (existing.some((c) => c.id === `type-${n}`)) n++
  return `type-${n}`
}

/**
 * Class types live inline on the tenant doc as an array, so every edit rewrites
 * the whole `classTypes` field. They drive calendar colours and the positive
 * instructor eligibility list, which is why deleting one warns about the
 * templates still pointing at it rather than silently orphaning them.
 */
export function ClassTypesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const save = useUpdateTenant()
  const templates = useTemplates()
  const canEdit = useCan('settings', 'edit')

  const [types, setTypes] = useState<ClassType[]>(tenant.classTypes)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({ labelHe: '', color: '#0ea5e9' })
  const [confirmDelete, setConfirmDelete] = useState<ClassType | null>(null)

  useEffect(() => {
    if (open) {
      setTypes(tenant.classTypes)
      setEditingId(null)
    }
  }, [open, tenant.classTypes])

  function startEdit(type: ClassType | null) {
    if (type) {
      setEditingId(type.id)
      setForm({ labelHe: type.labelHe, color: type.color })
    } else {
      setEditingId('new')
      setForm({ labelHe: '', color: '#0ea5e9' })
    }
  }

  async function persist(next: ClassType[]) {
    setTypes(next)
    await save.mutateAsync({ classTypes: next })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next =
      editingId === 'new'
        ? [...types, { id: makeId(types), labelHe: form.labelHe, color: form.color }]
        : types.map((t) =>
            t.id === editingId ? { ...t, labelHe: form.labelHe, color: form.color } : t,
          )
    await persist(next)
    setEditingId(null)
  }

  /** How many templates would lose their colour if this type disappeared. */
  function usageCount(id: string): number {
    return (templates.data ?? []).filter((t) => t.classTypeId === id).length
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.classTypesTitle}>
      {editingId === null ? (
        <>
          {types.length === 0 ? (
            <EmptyState title={he.settings.classTypesEmpty} />
          ) : (
            <div className="flex flex-col">
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => canEdit && startEdit(type)}
                  className="flex min-h-14 items-center gap-3 border-b border-hair py-3 text-start last:border-0"
                >
                  <span
                    aria-hidden="true"
                    className="size-5 shrink-0 rounded-full border border-line"
                    style={{ background: type.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{type.labelHe}</span>
                  {usageCount(type.id) > 0 && (
                    <span className="shrink-0 text-xs font-semibold text-faint tnum">
                      {usageCount(type.id)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {canEdit && (
            <Button onClick={() => startEdit(null)}>{he.settings.classTypeNew}</Button>
          )}
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label={he.settings.classTypeLabel}>
            <Input
              required
              value={form.labelHe}
              onChange={(e) => setForm({ ...form, labelHe: e.target.value })}
            />
          </Field>
          <Field label={he.settings.classTypeColor}>
            <label className="flex min-h-12 items-center gap-3 rounded-field border border-line px-3">
              <input
                type="color"
                aria-label={he.settings.classTypeColor}
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="size-8 shrink-0 cursor-pointer rounded border border-line bg-transparent"
              />
              <bdi className="text-xs font-bold tnum text-faint">{form.color}</bdi>
            </label>
          </Field>

          {editingId !== 'new' && (
            <button
              type="button"
              onClick={() => {
                const type = types.find((t) => t.id === editingId)
                if (type) setConfirmDelete(type)
              }}
              className="min-h-11 text-sm font-bold text-crit"
            >
              {he.settings.classTypeDelete}
            </button>
          )}

          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={() => setEditingId(null)}>{he.common.cancel}</Button>
            <Button type="submit" disabled={save.isPending}>{he.common.save}</Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        question={he.settings.classTypeDeleteConfirm}
        detail={
          confirmDelete && usageCount(confirmDelete.id) > 0
            ? fmt(he.settings.classTypeInUse, { n: usageCount(confirmDelete.id) })
            : undefined
        }
        onYes={async () => {
          if (!confirmDelete) return
          await persist(types.filter((t) => t.id !== confirmDelete.id))
          setConfirmDelete(null)
          setEditingId(null)
        }}
        onNo={() => setConfirmDelete(null)}
      />
    </Sheet>
  )
}
