import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Pill,
  Select,
} from '../../components/ui'
import { he } from '../../locale/he'
import { useAuth } from '../../auth/AuthProvider'
import { useTenant } from '../../tenant/TenantProvider'
import { useUpdateTenant, type TenantPatch } from '../../data/tenant'
import {
  canInstall,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from '../../lib/installPrompt'
import type { ClassType } from '../../types/models'

/**
 * §Settings — the operator's control panel for their own studio. Every field
 * writes to the tenant config document (see src/data/tenant.ts); the live
 * snapshot in TenantProvider reflects each save everywhere at once, theme
 * included. Function-owned data (ledger, invoices, entitlements, reports) is
 * never touched here.
 */
export function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <ProfileSection />
      <RegionSection />
      <AppearanceSection />
      <ClassTypesSection />
      <AccountantSection />
      <IntegrationsSection />
      <AccountSection />
    </div>
  )
}

// ── shared building blocks ────────────────────────────────────────────────────
function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <Card>
      <h2 className="text-base font-bold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  )
}

/** Wraps the tenant mutation with a transient "saved" acknowledgement. */
function useSaver() {
  const update = useUpdateTenant()
  const [justSaved, setJustSaved] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const save = useCallback(
    async (patch: TenantPatch) => {
      await update.mutateAsync(patch)
      setJustSaved(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setJustSaved(false), 2500)
    },
    [update],
  )
  return { save, pending: update.isPending, justSaved }
}

function SaveBar({
  dirty,
  pending,
  justSaved,
  valid = true,
  onSave,
}: {
  dirty: boolean
  pending: boolean
  justSaved: boolean
  valid?: boolean
  onSave: () => void
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-ok" role="status" aria-live="polite">
        {justSaved && !dirty ? he.settings.saved : ''}
      </span>
      <Button onClick={onSave} disabled={!dirty || pending || !valid}>
        {he.settings.saveSection}
      </Button>
    </div>
  )
}

function toHex(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : '#000000'
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <input
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-24 rounded-field border border-line bg-surface px-2 py-1.5 text-end text-sm tnum text-ink focus:border-accent focus:outline-none"
        />
        <input
          type="color"
          value={toHex(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="size-9 shrink-0 cursor-pointer rounded-field border border-line bg-surface"
        />
      </span>
    </div>
  )
}

// ── studio profile ────────────────────────────────────────────────────────────
function ProfileSection() {
  const tenant = useTenant()
  const { save, pending, justSaved } = useSaver()
  const [name, setName] = useState(tenant.name)
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? '')

  useEffect(() => {
    setName(tenant.name)
    setLogoUrl(tenant.logoUrl ?? '')
  }, [tenant.name, tenant.logoUrl])

  const trimmedLogo = logoUrl.trim()
  const dirty = name !== tenant.name || trimmedLogo !== (tenant.logoUrl ?? '')
  const valid = name.trim().length > 0

  return (
    <SettingsSection title={he.settings.profileTitle}>
      <div className="flex items-center gap-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-field border border-line bg-page">
          {trimmedLogo ? (
            <img src={trimmedLogo} alt={he.settings.logoPreview} className="size-full object-cover" />
          ) : (
            <span aria-hidden="true" className="text-xl font-extrabold text-primary">
              {(name.trim().charAt(0) || '·')}
            </span>
          )}
        </div>
        <span className="text-xs text-faint">
          {trimmedLogo ? he.settings.logoPreview : he.settings.noLogo}
        </span>
      </div>

      <Field label={he.settings.studioName}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={he.settings.logoUrl} hint={he.settings.logoHint}>
        <Input
          type="url"
          dir="ltr"
          className="text-start"
          placeholder="https://…"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
      </Field>

      <SaveBar
        dirty={dirty}
        pending={pending}
        justSaved={justSaved}
        valid={valid}
        onSave={() => save({ name: name.trim(), logoUrl: trimmedLogo })}
      />
    </SettingsSection>
  )
}

// ── region & language ─────────────────────────────────────────────────────────
const TIMEZONES = [
  'Asia/Jerusalem',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
]
const CURRENCIES: Array<[string, string]> = [
  ['ILS', '₪ שקל'],
  ['USD', '$ דולר'],
  ['EUR', '€ אירו'],
  ['GBP', '£ לירה שטרלינג'],
]
const LOCALES: Array<[string, string]> = [
  ['he-IL', 'עברית'],
  ['en-US', 'English (US)'],
  ['ar', 'العربية'],
  ['ru', 'Русский'],
]

function withValue(list: string[], value: string): string[] {
  return list.includes(value) ? list : [value, ...list]
}
function withPair(list: Array<[string, string]>, value: string): Array<[string, string]> {
  return list.some(([c]) => c === value) ? list : [[value, value], ...list]
}

function RegionSection() {
  const tenant = useTenant()
  const { save, pending, justSaved } = useSaver()
  const [timezone, setTimezone] = useState(tenant.timezone)
  const [currency, setCurrency] = useState(tenant.currency)
  const [locale, setLocale] = useState(tenant.locale)

  useEffect(() => {
    setTimezone(tenant.timezone)
    setCurrency(tenant.currency)
    setLocale(tenant.locale)
  }, [tenant.timezone, tenant.currency, tenant.locale])

  const dirty =
    timezone !== tenant.timezone || currency !== tenant.currency || locale !== tenant.locale

  return (
    <SettingsSection title={he.settings.regionTitle} hint={he.settings.regionHint}>
      <Field label={he.settings.timezone}>
        <Select value={timezone} dir="ltr" onChange={(e) => setTimezone(e.target.value)}>
          {withValue(TIMEZONES, tenant.timezone).map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={he.settings.currency}>
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {withPair(CURRENCIES, tenant.currency).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={he.settings.locale}>
        <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
          {withPair(LOCALES, tenant.locale).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <SaveBar
        dirty={dirty}
        pending={pending}
        justSaved={justSaved}
        onSave={() => save({ timezone, currency, locale })}
      />
    </SettingsSection>
  )
}

// ── appearance / theme ─────────────────────────────────────────────────────────
function AppearanceSection() {
  const tenant = useTenant()
  const { save, pending, justSaved } = useSaver()
  const themeKey = JSON.stringify(tenant.theme)
  const [theme, setTheme] = useState(tenant.theme)

  // resync the draft only when the SAVED theme changes (render-time reset, the
  // React-recommended alternative to an effect that would fire on every snapshot)
  const lastTheme = useRef(themeKey)
  if (lastTheme.current !== themeKey) {
    lastTheme.current = themeKey
    setTheme(tenant.theme)
  }

  const dirty = JSON.stringify(theme) !== themeKey
  const set = (k: keyof typeof theme) => (v: string) => setTheme((t) => ({ ...t, [k]: v }))

  return (
    <SettingsSection title={he.settings.appearanceTitle} hint={he.settings.appearanceHint}>
      <ColorField label={he.settings.colorPrimary} value={theme.primary} onChange={set('primary')} />
      <ColorField label={he.settings.colorAccent} value={theme.accent} onChange={set('accent')} />
      <ColorField label={he.settings.colorSurface} value={theme.surface} onChange={set('surface')} />
      <ColorField label={he.settings.colorText} value={theme.text} onChange={set('text')} />

      {/* live preview drawn from the DRAFT, not the applied theme */}
      <div
        className="rounded-card border p-4"
        style={{
          background: toHex(theme.surface),
          color: toHex(theme.text),
          borderColor: `color-mix(in srgb, ${toHex(theme.text)} 11%, ${toHex(theme.surface)})`,
        }}
      >
        <p className="text-sm font-bold">{he.settings.themePreview}</p>
        <p className="mt-1 text-xs" style={{ opacity: 0.7 }}>
          {he.settings.themePreviewBody}
        </p>
        <span
          className="mt-3 inline-flex min-h-9 items-center rounded-field px-4 text-sm font-semibold"
          style={{ background: toHex(theme.primary), color: '#ffffff' }}
        >
          {he.settings.themePreviewButton}
        </span>
      </div>

      <SaveBar
        dirty={dirty}
        pending={pending}
        justSaved={justSaved}
        onSave={() =>
          save({
            theme: {
              primary: toHex(theme.primary),
              accent: toHex(theme.accent),
              surface: toHex(theme.surface),
              text: toHex(theme.text),
            },
          })
        }
      />
    </SettingsSection>
  )
}

// ── class types ────────────────────────────────────────────────────────────────
function genId(): string {
  return `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function ClassTypesSection() {
  const tenant = useTenant()
  const { save, pending, justSaved } = useSaver()
  const listKey = JSON.stringify(tenant.classTypes)
  const [list, setList] = useState<ClassType[]>(tenant.classTypes)
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)

  // resync the draft only when the SAVED list changes (render-time reset)
  const lastList = useRef(listKey)
  if (lastList.current !== listKey) {
    lastList.current = listKey
    setList(tenant.classTypes)
  }

  const dirty = JSON.stringify(list) !== listKey
  const valid = list.every((c) => c.labelHe.trim().length > 0)

  const update = (i: number, patch: Partial<ClassType>) =>
    setList((l) => l.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const add = () =>
    setList((l) => [...l, { id: genId(), labelHe: '', color: toHex(tenant.theme.accent) }])

  return (
    <SettingsSection title={he.settings.classTypesTitle} hint={he.settings.classTypesHint}>
      {list.length === 0 ? (
        <EmptyState title={he.settings.classTypesEmpty} />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((c, i) => (
            <div key={c.id} className="flex items-end gap-2">
              <input
                type="color"
                value={toHex(c.color)}
                onChange={(e) => update(i, { color: e.target.value })}
                aria-label={he.settings.classTypeColor}
                className="mb-0.5 size-11 shrink-0 cursor-pointer rounded-field border border-line bg-surface"
              />
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-xs font-semibold text-muted">
                  {he.settings.classTypeLabel}
                </span>
                <Input value={c.labelHe} onChange={(e) => update(i, { labelHe: e.target.value })} />
              </label>
              <Button
                variant="ghost"
                aria-label={he.settings.removeClassType}
                className="mb-0.5 !min-h-11 !px-3 text-crit"
                onClick={() => setRemoveIdx(i)}
              >
                <TrashIcon />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="ghost" onClick={add}>
        {he.settings.addClassType}
      </Button>

      <SaveBar
        dirty={dirty}
        pending={pending}
        justSaved={justSaved}
        valid={valid}
        onSave={() =>
          save({ classTypes: list.map((c) => ({ ...c, labelHe: c.labelHe.trim(), color: toHex(c.color) })) })
        }
      />

      <ConfirmDialog
        open={removeIdx !== null}
        question={he.settings.removeClassTypeConfirm}
        detail={he.settings.removeClassTypeDetail}
        onNo={() => setRemoveIdx(null)}
        onYes={() => {
          setList((l) => l.filter((_, idx) => idx !== removeIdx))
          setRemoveIdx(null)
        }}
      />
    </SettingsSection>
  )
}

// ── accountant ─────────────────────────────────────────────────────────────────
function AccountantSection() {
  const tenant = useTenant()
  const { save, pending, justSaved } = useSaver()
  const src = tenant.accountant ?? { name: '', email: '' }
  const srcKey = JSON.stringify(src)
  const [acc, setAcc] = useState(src)

  // resync the draft only when the SAVED accountant changes (render-time reset)
  const lastAcc = useRef(srcKey)
  if (lastAcc.current !== srcKey) {
    lastAcc.current = srcKey
    setAcc(src)
  }

  const dirty = JSON.stringify(acc) !== srcKey

  return (
    <SettingsSection title={he.settings.accountantTitle} hint={he.settings.accountantHint}>
      <Field label={he.settings.accountantName}>
        <Input value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} />
      </Field>
      <Field label={he.settings.accountantEmail}>
        <Input
          type="email"
          dir="ltr"
          className="text-start"
          value={acc.email}
          onChange={(e) => setAcc({ ...acc, email: e.target.value })}
        />
      </Field>

      <SaveBar
        dirty={dirty}
        pending={pending}
        justSaved={justSaved}
        onSave={() => save({ accountant: { name: acc.name.trim(), email: acc.email.trim() } })}
      />
    </SettingsSection>
  )
}

// ── integrations (status only) ─────────────────────────────────────────────────
function IntegrationsSection() {
  const tenant = useTenant()
  const connected = (v?: Record<string, unknown>) => !!v && Object.keys(v).length > 0
  const rows: Array<[string, boolean]> = [
    [he.settings.integrationGrow, connected(tenant.integrations?.grow)],
    [he.settings.integrationInvoicing, connected(tenant.integrations?.invoicing)],
    [he.settings.integrationWhatsApp, connected(tenant.integrations?.whatsapp)],
  ]

  return (
    <SettingsSection title={he.settings.integrationsTitle} hint={he.settings.integrationsHint}>
      <div className="flex flex-col">
        {rows.map(([label, ok]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-hair py-3 last:border-0"
          >
            <span className="text-sm font-semibold">{label}</span>
            <Pill tone={ok ? 'ok' : 'muted'}>
              {ok ? he.settings.connected : he.settings.notConnected}
            </Pill>
          </div>
        ))}
      </div>
    </SettingsSection>
  )
}

// ── account + app ──────────────────────────────────────────────────────────────
function AccountSection() {
  const { user, signOutUser } = useAuth()
  const [confirmOut, setConfirmOut] = useState(false)
  const installable = useSyncExternalStore(subscribeInstall, canInstall)
  const standalone = isStandalone()

  return (
    <SettingsSection title={he.settings.accountTitle}>
      <div>
        <span className="block text-xs font-semibold text-muted">{he.settings.signedInAs}</span>
        <span dir="ltr" className="mt-0.5 block text-start text-sm font-bold">
          {user?.email ?? '—'}
        </span>
      </div>

      {!standalone && (
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{he.settings.installTitle}</span>
            <span className="block text-xs text-faint">{he.settings.installHint}</span>
          </span>
          <Button variant="ghost" disabled={!installable} onClick={() => void promptInstall()}>
            {he.settings.install}
          </Button>
        </div>
      )}
      {standalone && <p className="text-xs font-semibold text-ok">{he.settings.installed}</p>}

      <Button variant="ghost" className="text-crit" onClick={() => setConfirmOut(true)}>
        {he.auth.signOut}
      </Button>

      <ConfirmDialog
        open={confirmOut}
        question={he.settings.signOutConfirm}
        onNo={() => setConfirmOut(false)}
        onYes={() => {
          setConfirmOut(false)
          void signOutUser()
        }}
      />
    </SettingsSection>
  )
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5A1.5 1.5 0 0 0 8.8 21h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7M10 11v6M14 11v6" />
    </svg>
  )
}
