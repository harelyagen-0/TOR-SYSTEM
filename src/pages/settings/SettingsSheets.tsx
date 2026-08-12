/**
 * Edit sheets for the studio settings page. Each sheet seeds a local draft from
 * the live tenant config when it opens and writes a scoped patch on save; the
 * TenantProvider snapshot then re-renders (and re-themes) the whole app.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Field, Input, Select, Sheet } from '../../components/ui'
import { he } from '../../locale/he'
import { useTenant } from '../../tenant/TenantProvider'
import { useUpdateTenant } from '../../data/tenant'
import type { ClassType, TenantSocial } from '../../types/models'
import { SOCIAL_PLATFORMS, type SocialKey } from './social'

const DEFAULT_THEME = { primary: '#0070f3', accent: '#0070f3', surface: '#ffffff', text: '#0b0f1a' }
const NEW_CLASS_TYPE_COLOR = '#0ea5e9'

type SheetProps = { open: boolean; onClose: () => void }

// ── shared bits ──────────────────────────────────────────────────────────────
function SaveFooter({ onCancel, onSave, saving }: { onCancel: () => void; onSave: () => void; saving: boolean }) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>{he.common.cancel}</Button>
      <Button onClick={onSave} disabled={saving}>{he.common.save}</Button>
    </>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 items-center justify-between gap-3 rounded-field border border-line bg-surface px-4 text-sm font-semibold"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${checked ? 'justify-end bg-accent' : 'justify-start bg-line'}`}
      >
        <span className="size-5 rounded-full bg-white shadow-sm" />
      </span>
    </button>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-11 shrink-0 cursor-pointer rounded-field border border-line bg-surface p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" className="text-start uppercase" />
      </div>
    </Field>
  )
}

// ── business details ─────────────────────────────────────────────────────────
export function BusinessSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (!open) return
    setName(tenant.name)
    setLogoUrl(tenant.logoUrl ?? '')
    setPhone(tenant.contact?.phone ?? '')
    setEmail(tenant.contact?.email ?? '')
    setAddress(tenant.contact?.address ?? '')
  }, [open, tenant])

  async function save() {
    await update.mutateAsync({
      name: name.trim() || tenant.name,
      logoUrl: logoUrl.trim() || null,
      contact: { phone: phone.trim(), email: email.trim(), address: address.trim() },
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.business} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-field border border-line bg-page text-xl font-extrabold text-primary">
          {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : (name.trim().charAt(0) || '—')}
        </span>
        <p className="text-xs text-faint">{he.settings.logoHint}</p>
      </div>
      <Field label={he.settings.businessName}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={he.settings.logoUrl}>
        <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} dir="ltr" className="text-start" inputMode="url" />
      </Field>
      <Field label={he.settings.contactPhone}>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" dir="ltr" className="text-end" />
      </Field>
      <Field label={he.settings.contactEmail}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" dir="ltr" className="text-end" />
      </Field>
      <Field label={he.settings.contactAddress}>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
    </Sheet>
  )
}

// ── social media ─────────────────────────────────────────────────────────────
export function SocialSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [links, setLinks] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const s = tenant.social ?? {}
    setLinks(Object.fromEntries(SOCIAL_PLATFORMS.map(({ key }) => [key, s[key] ?? ''])))
  }, [open, tenant])

  async function save() {
    const social: TenantSocial = {}
    for (const { key } of SOCIAL_PLATFORMS) {
      const v = (links[key] ?? '').trim()
      if (v) social[key] = v
    }
    await update.mutateAsync({ social })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.social} subtitle={he.settings.socialHint} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
        <Field key={key} label={label}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-field bg-accent/10 text-accent">
              <SocialGlyph name={key} className="size-4.5" />
            </span>
            <Input
              value={links[key] ?? ''}
              onChange={(e) => setLinks((l) => ({ ...l, [key]: e.target.value }))}
              placeholder={placeholder}
              dir="ltr"
              className="min-w-0 flex-1 text-start"
              inputMode="url"
            />
          </div>
        </Field>
      ))}
    </Sheet>
  )
}

// ── branding (theme colours) ─────────────────────────────────────────────────
export function BrandingSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [primary, setPrimary] = useState(DEFAULT_THEME.primary)
  const [accent, setAccent] = useState(DEFAULT_THEME.accent)
  const [surface, setSurface] = useState(DEFAULT_THEME.surface)
  const [text, setText] = useState(DEFAULT_THEME.text)

  useEffect(() => {
    if (!open) return
    setPrimary(tenant.theme.primary)
    setAccent(tenant.theme.accent)
    setSurface(tenant.theme.surface)
    setText(tenant.theme.text)
  }, [open, tenant])

  async function save() {
    await update.mutateAsync({ theme: { primary, accent, surface, text } })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.branding} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      {/* live preview built from the draft colours */}
      <div className="rounded-card border border-line p-4" style={{ background: surface, color: text }}>
        <p className="mb-3 text-xs font-bold" style={{ color: text }}>{he.settings.brandingPreview}</p>
        <div className="flex items-center gap-2">
          <span className="inline-flex min-h-9 items-center rounded-field px-3 text-sm font-bold" style={{ background: primary, color: '#fff' }}>
            {he.settings.brandingPreviewBtn}
          </span>
          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: accent, background: `${accent}1a`, border: `1px solid ${accent}40` }}>
            {tenant.name}
          </span>
        </div>
      </div>

      <ColorField label={he.settings.colorPrimary} value={primary} onChange={setPrimary} />
      <ColorField label={he.settings.colorAccent} value={accent} onChange={setAccent} />
      <ColorField label={he.settings.colorSurface} value={surface} onChange={setSurface} />
      <ColorField label={he.settings.colorText} value={text} onChange={setText} />

      <button
        type="button"
        onClick={() => {
          setPrimary(DEFAULT_THEME.primary); setAccent(DEFAULT_THEME.accent)
          setSurface(DEFAULT_THEME.surface); setText(DEFAULT_THEME.text)
        }}
        className="min-h-11 text-sm font-bold text-accent"
      >
        {he.settings.resetDefaults}
      </button>
    </Sheet>
  )
}

// ── class types ──────────────────────────────────────────────────────────────
export function ClassTypesSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [types, setTypes] = useState<ClassType[]>([])

  useEffect(() => {
    if (!open) return
    setTypes(tenant.classTypes.map((t) => ({ ...t })))
  }, [open, tenant])

  function patch(i: number, next: Partial<ClassType>) {
    setTypes((list) => list.map((t, idx) => (idx === i ? { ...t, ...next } : t)))
  }
  function remove(i: number) {
    setTypes((list) => list.filter((_, idx) => idx !== i))
  }
  function add() {
    setTypes((list) => [...list, { id: `ct_${Math.random().toString(36).slice(2, 8)}`, labelHe: '', color: NEW_CLASS_TYPE_COLOR }])
  }
  async function save() {
    const cleaned = types.map((t) => ({ ...t, labelHe: t.labelHe.trim() })).filter((t) => t.labelHe)
    await update.mutateAsync({ classTypes: cleaned })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.classTypes} subtitle={he.settings.classTypesHint} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      {types.length === 0 && <EmptyRow text={he.settings.classTypesEmpty} />}
      {types.map((t, i) => (
        <div key={t.id} className="flex items-center gap-2">
          <input
            type="color"
            aria-label={he.settings.classTypeColor}
            value={t.color}
            onChange={(e) => patch(i, { color: e.target.value })}
            className="size-11 shrink-0 cursor-pointer rounded-field border border-line bg-surface p-1"
          />
          <Input value={t.labelHe} onChange={(e) => patch(i, { labelHe: e.target.value })} placeholder={he.settings.classTypeLabel} className="min-w-0 flex-1" />
          <IconButton onClick={() => remove(i)} label={he.common.delete} tone="crit" />
        </div>
      ))}
      <AddButton onClick={add} label={he.settings.addClassType} />
    </Sheet>
  )
}

// ── rooms & policy ───────────────────────────────────────────────────────────
export function RoomsPoliciesSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [rooms, setRooms] = useState<string[]>([])
  const [windowHours, setWindowHours] = useState('')
  const [lateCharge, setLateCharge] = useState(false)

  useEffect(() => {
    if (!open) return
    setRooms(tenant.rooms ? [...tenant.rooms] : [])
    setWindowHours(tenant.policy?.cancellationWindowHours != null ? String(tenant.policy.cancellationWindowHours) : '')
    setLateCharge(!!tenant.policy?.lateCancelCharge)
  }, [open, tenant])

  async function save() {
    const cleanedRooms = rooms.map((r) => r.trim()).filter(Boolean)
    const hours = Number(windowHours)
    await update.mutateAsync({
      rooms: cleanedRooms,
      policy: {
        cancellationWindowHours: Number.isFinite(hours) && windowHours !== '' ? hours : 0,
        lateCancelCharge: lateCharge,
      },
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.roomsPolicy} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      <SheetGroupTitle>{he.settings.rooms}</SheetGroupTitle>
      {rooms.length === 0 && <EmptyRow text={he.settings.roomsEmpty} />}
      {rooms.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={r} onChange={(e) => setRooms((list) => list.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={he.settings.roomName} className="min-w-0 flex-1" />
          <IconButton onClick={() => setRooms((list) => list.filter((_, idx) => idx !== i))} label={he.common.delete} tone="crit" />
        </div>
      ))}
      <AddButton onClick={() => setRooms((list) => [...list, ''])} label={he.settings.addRoom} />

      <SheetGroupTitle>{he.settings.policy}</SheetGroupTitle>
      <Field label={he.settings.cancellationWindow} hint={he.settings.cancellationWindowHint}>
        <Input value={windowHours} onChange={(e) => setWindowHours(e.target.value.replace(/\D/g, ''))} inputMode="numeric" dir="ltr" className="text-start" />
      </Field>
      <Toggle checked={lateCharge} onChange={setLateCharge} label={he.settings.lateCancelCharge} />
    </Sheet>
  )
}

// ── accountant + locale ──────────────────────────────────────────────────────
const CURRENCIES = ['ILS', 'USD', 'EUR']
const LOCALES = ['he-IL', 'en-US']
const TIMEZONES = ['Asia/Jerusalem', 'Europe/London', 'America/New_York', 'UTC']

export function AccountantSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [accName, setAccName] = useState('')
  const [accEmail, setAccEmail] = useState('')
  const [timezone, setTimezone] = useState(tenant.timezone)
  const [currency, setCurrency] = useState(tenant.currency)
  const [locale, setLocale] = useState(tenant.locale)

  useEffect(() => {
    if (!open) return
    setAccName(tenant.accountant?.name ?? '')
    setAccEmail(tenant.accountant?.email ?? '')
    setTimezone(tenant.timezone)
    setCurrency(tenant.currency)
    setLocale(tenant.locale)
  }, [open, tenant])

  async function save() {
    await update.mutateAsync({
      accountant: { name: accName.trim(), email: accEmail.trim() },
      timezone,
      currency,
      locale,
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.accountant} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      <Field label={he.settings.accountantName}>
        <Input value={accName} onChange={(e) => setAccName(e.target.value)} />
      </Field>
      <Field label={he.settings.accountantEmail}>
        <Input value={accEmail} onChange={(e) => setAccEmail(e.target.value)} type="email" inputMode="email" dir="ltr" className="text-end" />
      </Field>
      <Field label={he.settings.currency}>
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label={he.settings.localeField}>
        <Select value={locale} onChange={(e) => setLocale(e.target.value)}>
          {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
      </Field>
      <Field label={he.settings.timezone}>
        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
    </Sheet>
  )
}

// ── integrations ─────────────────────────────────────────────────────────────
export function IntegrationsSheet({ open, onClose }: SheetProps) {
  const tenant = useTenant()
  const update = useUpdateTenant()
  const [growEnabled, setGrowEnabled] = useState(false)
  const [growKey, setGrowKey] = useState('')
  const [invEnabled, setInvEnabled] = useState(false)
  const [invProvider, setInvProvider] = useState('')
  const [waEnabled, setWaEnabled] = useState(false)

  useEffect(() => {
    if (!open) return
    const i = tenant.integrations ?? {}
    setGrowEnabled(!!i.grow?.enabled)
    setGrowKey(i.grow?.apiKey ?? '')
    setInvEnabled(!!i.invoicing?.enabled)
    setInvProvider(i.invoicing?.provider ?? '')
    setWaEnabled(!!i.whatsapp?.enabled)
  }, [open, tenant])

  async function save() {
    await update.mutateAsync({
      integrations: {
        grow: { enabled: growEnabled, apiKey: growKey.trim() },
        invoicing: { enabled: invEnabled, provider: invProvider.trim() },
        whatsapp: { enabled: waEnabled },
      },
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.settings.integrations} subtitle={he.settings.integrationsNote} footer={<SaveFooter onCancel={onClose} onSave={save} saving={update.isPending} />}>
      <SheetGroupTitle>{he.settings.grow}</SheetGroupTitle>
      <Toggle checked={growEnabled} onChange={setGrowEnabled} label={he.settings.enabled} />
      <Field label={he.settings.growKey}>
        <Input value={growKey} onChange={(e) => setGrowKey(e.target.value)} dir="ltr" className="text-start" />
      </Field>

      <SheetGroupTitle>{he.settings.invoicing}</SheetGroupTitle>
      <Toggle checked={invEnabled} onChange={setInvEnabled} label={he.settings.enabled} />
      <Field label={he.settings.invoicingProvider}>
        <Input value={invProvider} onChange={(e) => setInvProvider(e.target.value)} />
      </Field>

      <SheetGroupTitle>{he.settings.whatsapp}</SheetGroupTitle>
      <Toggle checked={waEnabled} onChange={setWaEnabled} label={he.settings.enabled} />
    </Sheet>
  )
}

// ── social brand glyphs ──────────────────────────────────────────────────────
export function SocialGlyph({ name, className = 'size-4' }: { name: SocialKey; className?: string }) {
  const p = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true,
  } as const
  switch (name) {
    case 'instagram':
      return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="16.7" cy="7.3" r="1.15" fill="currentColor" stroke="none" /></svg>
    case 'facebook':
      return <svg {...p}><path d="M13.5 21v-7h2.35l.4-2.9h-2.75V9.25c0-.84.28-1.42 1.5-1.42h1.45V5.15C15.95 5.07 15.1 5 14.15 5c-2.17 0-3.65 1.32-3.65 3.75v2.35H8v2.9h2.5V21z" fill="currentColor" stroke="none" /></svg>
    case 'tiktok':
      return <svg {...p}><path d="M14.2 3h2.5c.25 1.6 1.15 2.98 2.9 3.35v2.5c-1.02 0-2.02-.3-2.9-.86v5.75c0 2.63-2.13 4.76-4.76 4.76S7.2 18.13 7.2 15.5s2.13-4.76 4.76-4.76c.28 0 .55.02.82.07v2.62a2.16 2.16 0 1 0 1.5 2.05V3z" fill="currentColor" stroke="none" /></svg>
    case 'youtube':
      return <svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="3.5" /><path d="M10.3 9.4l4.7 2.6-4.7 2.6z" fill="currentColor" stroke="none" /></svg>
    case 'website':
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.6 12h16.8M12 3.5c2.3 2.4 2.3 14.6 0 17M12 3.5c-2.3 2.4-2.3 14.6 0 17" /></svg>
  }
}

// ── small shared components ──────────────────────────────────────────────────
function SheetGroupTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 text-sm font-bold text-muted">{children}</h3>
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-field border border-dashed border-line px-4 py-3 text-center text-sm font-semibold text-faint">{text}</p>
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-center gap-2 rounded-field border border-dashed border-accent/50 text-sm font-bold text-accent"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  )
}

function IconButton({ onClick, label, tone = 'muted' }: { onClick: () => void; label: string; tone?: 'muted' | 'crit' }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-field border border-line bg-surface ${tone === 'crit' ? 'text-crit' : 'text-muted'}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      </svg>
    </button>
  )
}
