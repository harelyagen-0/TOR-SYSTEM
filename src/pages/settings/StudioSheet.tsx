import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Field, Input, Select, Sheet } from '../../components/ui'
import { he } from '../../locale/he'
import { useTenant } from '../../tenant/TenantProvider'
import { useUpdateTenant, useUploadLogo } from '../../data/settings'
import { useCan } from '../../auth/AuthProvider'
import type { TenantTheme } from '../../types/models'

/** Studios in this product are Israeli; the list stays short on purpose. */
const TIMEZONES = ['Asia/Jerusalem', 'Europe/London', 'America/New_York', 'UTC']
const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP']
const LOCALES = ['he-IL', 'en-US', 'en-GB']

const THEME_FIELDS: Array<{ key: keyof TenantTheme; label: string }> = [
  { key: 'primary', label: he.settings.themePrimary },
  { key: 'accent', label: he.settings.themeAccent },
  { key: 'surface', label: he.settings.themeSurface },
  { key: 'text', label: he.settings.themeText },
]

/**
 * Studio identity + the four theme colours. Saving writes the tenant doc, which
 * TenantProvider is watching live — the header and every derived tone update
 * without a reload.
 */
export function StudioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const save = useUpdateTenant()
  const uploadLogo = useUploadLogo()
  const canEdit = useCan('settings', 'edit')
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: tenant.name,
    timezone: tenant.timezone,
    currency: tenant.currency,
    locale: tenant.locale,
    logoUrl: tenant.logoUrl ?? null as string | null,
    theme: { ...tenant.theme },
  })

  // re-sync when the sheet is reopened (or the tenant doc changes underneath)
  useEffect(() => {
    if (!open) return
    setForm({
      name: tenant.name,
      timezone: tenant.timezone,
      currency: tenant.currency,
      locale: tenant.locale,
      logoUrl: tenant.logoUrl ?? null,
      theme: { ...tenant.theme },
    })
  }, [open, tenant])

  async function onPickLogo(file: File) {
    const url = await uploadLogo.mutateAsync(file)
    setForm((f) => ({ ...f, logoUrl: url }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await save.mutateAsync({
      name: form.name,
      timezone: form.timezone,
      currency: form.currency,
      locale: form.locale,
      logoUrl: form.logoUrl,
      theme: form.theme,
    })
    onClose()
  }

  const busy = save.isPending || uploadLogo.isPending

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.studioTitle}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={he.settings.studioName}>
          <Input
            required
            disabled={!canEdit}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-semibold">{he.settings.logo}</span>
          <div className="flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-field border border-line bg-page">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="size-full object-cover" />
              ) : (
                <span aria-hidden="true" className="text-xl font-extrabold text-primary">
                  {form.name.trim().charAt(0)}
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onPickLogo(file)
                }}
              />
              <Button
                variant="ghost"
                disabled={!canEdit || uploadLogo.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploadLogo.isPending ? he.common.loading : he.settings.logoUpload}
              </Button>
              {form.logoUrl && canEdit && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, logoUrl: null })}
                  className="min-h-11 text-xs font-bold text-crit"
                >
                  {he.settings.logoRemove}
                </button>
              )}
            </div>
          </div>
          <span className="mt-1 block text-xs text-faint">{he.settings.logoHint}</span>
        </div>

        <Field label={he.settings.timezone}>
          <Select
            disabled={!canEdit}
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={he.settings.currency}>
            <Select
              disabled={!canEdit}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={he.settings.locale}>
            <Select
              disabled={!canEdit}
              value={form.locale}
              onChange={(e) => setForm({ ...form, locale: e.target.value })}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{he.settings.themeTitle}</legend>
          <p className="mb-2 text-xs text-faint">{he.settings.themeHint}</p>
          <div className="flex flex-col gap-1.5">
            {THEME_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="flex min-h-12 items-center gap-3 rounded-field border border-line px-3"
              >
                <input
                  type="color"
                  disabled={!canEdit}
                  aria-label={label}
                  value={form.theme[key]}
                  onChange={(e) =>
                    setForm({ ...form, theme: { ...form.theme, [key]: e.target.value } })
                  }
                  className="size-8 shrink-0 cursor-pointer rounded border border-line bg-transparent"
                />
                <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
                <bdi className="text-xs font-bold tnum text-faint">{form.theme[key]}</bdi>
              </label>
            ))}
          </div>
        </fieldset>

        {canEdit && (
          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
            <Button type="submit" disabled={busy}>{he.common.save}</Button>
          </div>
        )}
      </form>
    </Sheet>
  )
}
