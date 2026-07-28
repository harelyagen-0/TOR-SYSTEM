import { useEffect, useState, type FormEvent } from 'react'
import { Button, Field, Input, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { useTenant } from '../../tenant/TenantProvider'
import { useUpdateTenant } from '../../data/settings'
import { useCan } from '../../auth/AuthProvider'
import { DEFAULT_POLICIES } from '../../types/models'

/**
 * Accountant contact + the business rules that other screens actually read:
 * the cancellation window decides `Registration.lateCancel`, and the day range
 * bounds the calendar week grid.
 */
export function PoliciesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const save = useUpdateTenant()
  const canEdit = useCan('settings', 'edit')

  const policies = tenant.policies ?? DEFAULT_POLICIES
  const [form, setForm] = useState({
    accountantName: tenant.accountant?.name ?? '',
    accountantEmail: tenant.accountant?.email ?? '',
    cancellationWindowHours: policies.cancellationWindowHours,
    dayStartHour: policies.dayStartHour,
    dayEndHour: policies.dayEndHour,
  })

  useEffect(() => {
    if (!open) return
    const p = tenant.policies ?? DEFAULT_POLICIES
    setForm({
      accountantName: tenant.accountant?.name ?? '',
      accountantEmail: tenant.accountant?.email ?? '',
      cancellationWindowHours: p.cancellationWindowHours,
      dayStartHour: p.dayStartHour,
      dayEndHour: p.dayEndHour,
    })
  }, [open, tenant])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    // keep the grid coherent even if the two hour inputs are crossed over
    const start = Math.min(form.dayStartHour, form.dayEndHour)
    const end = Math.max(form.dayStartHour, form.dayEndHour)
    await save.mutateAsync({
      accountant: { name: form.accountantName, email: form.accountantEmail },
      policies: {
        cancellationWindowHours: Math.max(0, form.cancellationWindowHours),
        dayStartHour: start,
        dayEndHour: end,
      },
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.policiesTitle}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{he.settings.accountantTitle}</legend>
          <p className="mb-2 text-xs text-faint">{he.settings.accountantHint}</p>
          <div className="flex flex-col gap-3">
            <Field label={he.settings.accountantName}>
              <Input
                disabled={!canEdit}
                value={form.accountantName}
                onChange={(e) => setForm({ ...form, accountantName: e.target.value })}
              />
            </Field>
            <Field label={he.settings.accountantEmail}>
              <Input
                type="email"
                dir="ltr"
                className="text-end"
                disabled={!canEdit}
                value={form.accountantEmail}
                onChange={(e) => setForm({ ...form, accountantEmail: e.target.value })}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{he.settings.cancellationTitle}</legend>
          <Field
            label={he.settings.cancellationWindow}
            hint={fmt(he.settings.cancellationHint, { n: form.cancellationWindowHours })}
          >
            <Input
              type="number"
              min={0}
              max={168}
              inputMode="numeric"
              disabled={!canEdit}
              value={form.cancellationWindowHours}
              onChange={(e) =>
                setForm({ ...form, cancellationWindowHours: Number(e.target.value) })
              }
            />
          </Field>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{he.settings.dayRangeTitle}</legend>
          <p className="mb-2 text-xs text-faint">{he.settings.dayRangeHint}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.settings.dayStart}>
              <Input
                type="number"
                min={0}
                max={23}
                inputMode="numeric"
                disabled={!canEdit}
                value={form.dayStartHour}
                onChange={(e) => setForm({ ...form, dayStartHour: Number(e.target.value) })}
              />
            </Field>
            <Field label={he.settings.dayEnd}>
              <Input
                type="number"
                min={1}
                max={24}
                inputMode="numeric"
                disabled={!canEdit}
                value={form.dayEndHour}
                onChange={(e) => setForm({ ...form, dayEndHour: Number(e.target.value) })}
              />
            </Field>
          </div>
        </fieldset>

        {canEdit && (
          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
            <Button type="submit" disabled={save.isPending}>{he.common.save}</Button>
          </div>
        )}
      </form>
    </Sheet>
  )
}
