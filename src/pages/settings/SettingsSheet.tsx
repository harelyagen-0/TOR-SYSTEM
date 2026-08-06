import { useEffect, useState } from 'react'
import { Button, Field, Input, Sheet } from '../../components/ui'
import { he } from '../../locale/he'
import { pushToast } from '../../lib/toastStore'
import { useTenant } from '../../tenant/TenantProvider'
import { useUpdateTenant } from '../../data/tenant'
import { useAuth } from '../../auth/AuthProvider'
import type { ClassType } from '../../types/models'

/**
 * Studio self-service settings (P3-3): name, brand colours, accountant,
 * cancellation policy, and class types. Only the fields firestore.rules marks
 * self-editable are written; timezone/currency/integrations stay vendor-owned.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const { signOutUser } = useAuth()

  const [name, setName] = useState(tenant.name)
  const [theme, setTheme] = useState(tenant.theme)
  const [accountant, setAccountant] = useState(tenant.accountant ?? { name: '', email: '' })
  const [policy, setPolicy] = useState(tenant.policy ?? { lateCancelHours: 6, lateCancelCharges: true })
  const [classTypes, setClassTypes] = useState<ClassType[]>(tenant.classTypes)

  useEffect(() => {
    if (open) {
      setName(tenant.name)
      setTheme(tenant.theme)
      setAccountant(tenant.accountant ?? { name: '', email: '' })
      setPolicy(tenant.policy ?? { lateCancelHours: 6, lateCancelCharges: true })
      setClassTypes(tenant.classTypes)
    }
  }, [open, tenant])

  async function save() {
    await update.mutateAsync({
      name: name.trim(),
      theme,
      accountant: accountant.email.trim() ? accountant : undefined,
      policy,
      classTypes: classTypes.filter((c) => c.labelHe.trim()),
    })
    pushToast({ tone: 'success', message: he.settings.saved })
    onClose()
  }

  const colorField = (key: keyof typeof theme, label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>{label}</span>
      <input
        type="color"
        value={theme[key]}
        onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
        className="size-9 shrink-0 cursor-pointer rounded-field border border-line bg-surface"
      />
    </label>
  )

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.title}>
      <Field label={he.settings.studioName}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-bold">{he.settings.theme}</p>
        {colorField('primary', he.settings.themePrimary)}
        {colorField('accent', he.settings.themeAccent)}
        {colorField('surface', he.settings.themeSurface)}
        {colorField('text', he.settings.themeText)}
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-sm font-bold">{he.settings.accountant}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={he.settings.accountantName}>
            <Input value={accountant.name} onChange={(e) => setAccountant({ ...accountant, name: e.target.value })} />
          </Field>
          <Field label={he.settings.accountantEmail}>
            <Input type="email" dir="ltr" className="text-end" value={accountant.email} onChange={(e) => setAccountant({ ...accountant, email: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-sm font-bold">{he.settings.policy}</p>
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label={he.settings.lateCancelHours}>
            <Input type="number" min="0" dir="ltr" className="text-end tnum" value={String(policy.lateCancelHours)} onChange={(e) => setPolicy({ ...policy, lateCancelHours: Number(e.target.value) })} />
          </Field>
          <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--t-accent)]" checked={policy.lateCancelCharges} onChange={(e) => setPolicy({ ...policy, lateCancelCharges: e.target.checked })} />
            {he.settings.lateCancelCharges}
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-bold">{he.settings.classTypes}</p>
        {classTypes.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2">
            <Input
              value={c.labelHe}
              onChange={(e) => setClassTypes(classTypes.map((x, j) => (j === i ? { ...x, labelHe: e.target.value } : x)))}
            />
            <input
              type="color"
              value={c.color}
              onChange={(e) => setClassTypes(classTypes.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
              className="size-9 shrink-0 cursor-pointer rounded-field border border-line"
            />
            <button
              type="button"
              aria-label={he.common.delete}
              onClick={() => setClassTypes(classTypes.filter((_, j) => j !== i))}
              className="grid size-9 shrink-0 place-items-center rounded-field border border-line text-faint"
            >
              ×
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() =>
            setClassTypes([...classTypes, { id: `ct_${Date.now().toString(36)}`, labelHe: '', color: theme.accent }])
          }
        >
          {he.settings.addClassType}
        </Button>
      </section>

      <div className="flex gap-3 [&>*]:flex-1">
        <Button variant="ghost" className="text-crit" onClick={() => signOutUser()}>{he.settings.signOut}</Button>
        <Button disabled={update.isPending} onClick={save}>{he.common.save}</Button>
      </div>
    </Sheet>
  )
}
