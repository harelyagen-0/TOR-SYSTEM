import { useEffect, useState, type ReactNode } from 'react'
import { Button, Field, Input, Select, Sheet } from './ui'
import { he } from '../locale/he'
import { useTenant } from '../tenant/TenantProvider'
import { useAuth } from '../auth/AuthProvider'
import { useUpdateTenant } from '../data/tenant'
import type { ClassType } from '../types/models'

const TIMEZONES = ['Asia/Jerusalem', 'Europe/London', 'Europe/Paris', 'America/New_York', 'UTC']
const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP']
const LOCALES = ['he-IL', 'en-US']

/**
 * Settings (הגדרות) — opened from the studio logo in the header. Edits the
 * tenant document; TenantProvider's live subscription applies changes at once
 * (theme colours recolour the whole app the moment they're saved).
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const { user, signOutUser } = useAuth()
  const update = useUpdateTenant()

  // profile
  const [name, setName] = useState(tenant.name)
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? '')
  const [timezone, setTimezone] = useState(tenant.timezone)
  const [currency, setCurrency] = useState(tenant.currency)
  const [locale, setLocale] = useState(tenant.locale)
  // class types
  const [classTypes, setClassTypes] = useState<ClassType[]>(tenant.classTypes)
  // theme
  const [theme, setTheme] = useState(tenant.theme)
  // account
  const [accName, setAccName] = useState(tenant.accountant?.name ?? '')
  const [accEmail, setAccEmail] = useState(tenant.accountant?.email ?? '')

  const [savedKey, setSavedKey] = useState<string | null>(null)

  // re-seed local state whenever the sheet is (re)opened
  useEffect(() => {
    if (!open) return
    setName(tenant.name)
    setLogoUrl(tenant.logoUrl ?? '')
    setTimezone(tenant.timezone)
    setCurrency(tenant.currency)
    setLocale(tenant.locale)
    setClassTypes(tenant.classTypes)
    setTheme(tenant.theme)
    setAccName(tenant.accountant?.name ?? '')
    setAccEmail(tenant.accountant?.email ?? '')
    setSavedKey(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function save(key: string, patch: Parameters<typeof update.mutateAsync>[0]) {
    await update.mutateAsync(patch)
    setSavedKey(key)
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1800)
  }

  const savedLabel = (key: string) => (savedKey === key ? he.settings.saved : he.common.save)

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.title}>
      <div className="flex flex-col gap-6">
        {/* ── studio profile ─────────────────────────────────────────── */}
        <Section title={he.settings.profile}>
          <Field label={he.settings.studioName}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={`${he.settings.logoUrl} ${he.common.optional}`}>
            <Input dir="ltr" className="text-end" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={he.settings.currency}>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label={he.settings.locale}>
              <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
                {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label={he.settings.timezone}>
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            disabled={update.isPending}
            onClick={() => save('profile', { name, logoUrl: logoUrl || undefined, timezone, currency, locale })}
          >
            {savedLabel('profile')}
          </Button>
        </Section>

        {/* ── class types ────────────────────────────────────────────── */}
        <Section title={he.settings.classTypes} hint={he.settings.classTypesHint}>
          <div className="flex flex-col gap-2">
            {classTypes.map((ct, i) => (
              <div key={ct.id} className="flex items-center gap-2 rounded-field border border-line bg-surface p-2">
                <input
                  type="color"
                  aria-label={he.settings.classTypeName}
                  value={ct.color}
                  onChange={(e) => setClassTypes((list) => list.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
                  className="size-8 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
                />
                <Input
                  className="flex-1"
                  placeholder={he.settings.classTypeName}
                  value={ct.labelHe}
                  onChange={(e) => setClassTypes((list) => list.map((x, j) => (j === i ? { ...x, labelHe: e.target.value } : x)))}
                />
                <button
                  type="button"
                  aria-label={he.common.delete}
                  onClick={() => setClassTypes((list) => list.filter((_, j) => j !== i))}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-crit hover:bg-crit/10"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4.5" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            onClick={() =>
              setClassTypes((list) => [
                ...list,
                { id: crypto.randomUUID().slice(0, 8), labelHe: '', color: '#7c8798' },
              ])
            }
          >
            {he.settings.addClassType}
          </Button>
          <Button
            disabled={update.isPending}
            onClick={() => save('classTypes', { classTypes: classTypes.filter((c) => c.labelHe.trim()) })}
          >
            {savedLabel('classTypes')}
          </Button>
        </Section>

        {/* ── theme colours ──────────────────────────────────────────── */}
        <Section title={he.settings.theme}>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label={he.settings.themePrimary} value={theme.primary} onChange={(v) => setTheme({ ...theme, primary: v })} />
            <ColorField label={he.settings.themeAccent} value={theme.accent} onChange={(v) => setTheme({ ...theme, accent: v })} />
            <ColorField label={he.settings.themeSurface} value={theme.surface} onChange={(v) => setTheme({ ...theme, surface: v })} />
            <ColorField label={he.settings.themeText} value={theme.text} onChange={(v) => setTheme({ ...theme, text: v })} />
          </div>
          <Button disabled={update.isPending} onClick={() => save('theme', { theme })}>
            {savedLabel('theme')}
          </Button>
        </Section>

        {/* ── account & sign out ─────────────────────────────────────── */}
        <Section title={he.settings.account}>
          {user?.email && (
            <p className="text-sm text-muted">
              {he.settings.signedInAs} <bdi className="font-semibold text-ink" dir="ltr">{user.email}</bdi>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={he.settings.accountantName}>
              <Input value={accName} onChange={(e) => setAccName(e.target.value)} />
            </Field>
            <Field label={he.settings.accountantEmail}>
              <Input type="email" dir="ltr" className="text-end" value={accEmail} onChange={(e) => setAccEmail(e.target.value)} />
            </Field>
          </div>
          <Button
            disabled={update.isPending}
            onClick={() => save('account', { accountant: { name: accName.trim(), email: accEmail.trim() } })}
          >
            {savedLabel('account')}
          </Button>
          <Button variant="danger" onClick={() => void signOutUser()}>
            {he.settings.signOut}
          </Button>
        </Section>
      </div>
    </Sheet>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hair pt-4 first:border-0 first:pt-0">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-field border border-line bg-surface p-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-faint tnum" dir="ltr">{value}</span>
      </span>
    </label>
  )
}
