/**
 * Studio settings hub. Every business setting and datum lives in the tenant
 * config document; this page groups them into rows that open focused edit
 * sheets, plus an account group for signing out. Reached by tapping the studio
 * logo in the header (the bottom nav stays a fixed five tabs, spec §6).
 */
import { useState, type ReactNode } from 'react'
import { Button, Card } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { useTenant } from '../../tenant/TenantProvider'
import { useAuth } from '../../auth/AuthProvider'
import {
  AccountantSheet,
  BrandingSheet,
  BusinessSheet,
  ClassTypesSheet,
  GeneralInfoSheet,
  IntegrationsSheet,
  RoomsPoliciesSheet,
  SocialGlyph,
  SocialSheet,
  StaffSheet,
  SupportSheet,
} from './SettingsSheets'
import { SOCIAL_PLATFORMS } from './social'
import type { TenantSocial } from '../../types/models'

type SheetId =
  | 'business' | 'generalInfo' | 'social' | 'branding' | 'classTypes' | 'rooms'
  | 'staff' | 'accountant' | 'integrations' | 'support' | null

export function SettingsPage() {
  const tenant = useTenant()
  const { user, signOutUser } = useAuth()
  const [sheet, setSheet] = useState<SheetId>(null)

  return (
    <div className="flex flex-col gap-5">
      <SettingsGroup title={he.settings.groupBusiness}>
        <Row
          label={he.settings.business}
          sub={he.settings.businessSub}
          value={tenant.name}
          onClick={() => setSheet('business')}
          icon={<StoreIcon />}
        />
        <Row
          label={he.settings.generalInfo}
          sub={he.settings.generalInfoSub}
          value={tenant.generalInfo?.length ? String(tenant.generalInfo.length) : undefined}
          onClick={() => setSheet('generalInfo')}
          icon={<InfoIcon />}
        />
        <Row
          label={he.settings.social}
          sub={he.settings.socialSub}
          onClick={() => setSheet('social')}
          icon={<ShareIcon />}
          trailing={<SocialSummary social={tenant.social} />}
        />
        <Row
          label={he.settings.branding}
          sub={he.settings.brandingSub}
          onClick={() => setSheet('branding')}
          icon={<PaletteIcon />}
          trailing={<Swatch colors={[tenant.theme.primary, tenant.theme.accent]} />}
        />
        <Row
          label={he.settings.classTypes}
          value={fmt(he.settings.classTypesSub, { n: tenant.classTypes.length })}
          onClick={() => setSheet('classTypes')}
          icon={<TagIcon />}
          trailing={<Swatch colors={tenant.classTypes.map((t) => t.color)} />}
        />
        <Row
          label={he.settings.roomsPolicy}
          sub={he.settings.roomsPolicySub}
          value={tenant.rooms?.length ? String(tenant.rooms.length) : undefined}
          onClick={() => setSheet('rooms')}
          icon={<DoorIcon />}
        />
      </SettingsGroup>

      <SettingsGroup title={he.settings.groupStaff}>
        <Row
          label={he.settings.staff}
          sub={he.settings.staffSub}
          value={tenant.staff?.length ? String(tenant.staff.length) : undefined}
          onClick={() => setSheet('staff')}
          icon={<StaffIcon />}
        />
      </SettingsGroup>

      <SettingsGroup title={he.settings.groupAccounting}>
        <Row
          label={he.settings.accountant}
          sub={he.settings.accountantSub}
          value={tenant.currency}
          onClick={() => setSheet('accountant')}
          icon={<CalcIcon />}
        />
      </SettingsGroup>

      <SettingsGroup title={he.settings.groupConnections}>
        <Row
          label={he.settings.integrations}
          sub={he.settings.integrationsSub}
          onClick={() => setSheet('integrations')}
          icon={<PlugIcon />}
        />
      </SettingsGroup>

      <SettingsGroup title={he.settings.groupSupport}>
        <Row
          label={he.settings.support}
          sub={he.settings.supportSub}
          onClick={() => setSheet('support')}
          icon={<SupportIcon />}
        />
      </SettingsGroup>

      <SettingsGroup title={he.settings.groupAccount}>
        <div className="flex flex-col gap-3 p-4">
          {user?.email && (
            <p className="text-sm text-muted">
              {fmt(he.settings.signedInAs, { email: user.email })}
            </p>
          )}
          <Button variant="ghost" className="text-crit" onClick={() => void signOutUser()}>
            {he.auth.signOut}
          </Button>
        </div>
      </SettingsGroup>

      <BusinessSheet open={sheet === 'business'} onClose={() => setSheet(null)} />
      <GeneralInfoSheet open={sheet === 'generalInfo'} onClose={() => setSheet(null)} />
      <SocialSheet open={sheet === 'social'} onClose={() => setSheet(null)} />
      <BrandingSheet open={sheet === 'branding'} onClose={() => setSheet(null)} />
      <ClassTypesSheet open={sheet === 'classTypes'} onClose={() => setSheet(null)} />
      <RoomsPoliciesSheet open={sheet === 'rooms'} onClose={() => setSheet(null)} />
      <StaffSheet open={sheet === 'staff'} onClose={() => setSheet(null)} />
      <AccountantSheet open={sheet === 'accountant'} onClose={() => setSheet(null)} />
      <IntegrationsSheet open={sheet === 'integrations'} onClose={() => setSheet(null)} />
      <SupportSheet open={sheet === 'support'} onClose={() => setSheet(null)} />
    </div>
  )
}

// ── layout ───────────────────────────────────────────────────────────────────
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-faint">{title}</h2>
      <Card className="!p-0">{children}</Card>
    </section>
  )
}

function Row({
  label,
  sub,
  value,
  trailing,
  icon,
  onClick,
}: {
  label: string
  sub?: string
  value?: string
  trailing?: ReactNode
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-hair p-3.5 text-start last:border-0"
    >
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-field bg-accent/10 text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{label}</span>
        {sub && <span className="block truncate text-xs text-faint">{sub}</span>}
      </span>
      {trailing}
      {value && <span className="shrink-0 truncate text-sm font-semibold text-muted">{value}</span>}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-faint" aria-hidden="true">
        {/* chevron points to the trailing (physical-left) edge in RTL */}
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  )
}

function SocialSummary({ social }: { social?: TenantSocial }) {
  const filled = SOCIAL_PLATFORMS.filter((p) => (social?.[p.key] ?? '').trim())
  if (filled.length === 0) return null
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 text-muted">
      {filled.map((p) => <SocialGlyph key={p.key} name={p.key} className="size-4" />)}
    </span>
  )
}

function Swatch({ colors }: { colors: string[] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-1">
      {colors.slice(0, 4).map((c, i) => (
        <span key={i} className="size-4 rounded-full border border-surface" style={{ background: c }} />
      ))}
    </span>
  )
}

// ── icons ────────────────────────────────────────────────────────────────────
const ic = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round', strokeLinejoin: 'round', className: 'size-5', 'aria-hidden': true,
} as const

function StoreIcon() {
  return <svg {...ic}><path d="M4 9.5 5.2 4.5h13.6L20 9.5M4 9.5v9.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5M4 9.5a2.2 2.2 0 0 0 4 0 2.2 2.2 0 0 0 4 0 2.2 2.2 0 0 0 4 0 2.2 2.2 0 0 0 4 0" /></svg>
}
function PaletteIcon() {
  return <svg {...ic}><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.3-1.2-1.5-1.2-2.6 0-.8.7-1.4 1.6-1.4H16a5 5 0 0 0 5-5c0-4-4-7-9-7z" /><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/></svg>
}
function TagIcon() {
  return <svg {...ic}><path d="M20.3 13.4l-6.9 6.9a2 2 0 0 1-2.8 0L3.5 13.2V4.5h8.7l8.1 8.1a1 1 0 0 1 0 .8z" /><circle cx="7.9" cy="8.3" r="1.2" /></svg>
}
function DoorIcon() {
  return <svg {...ic}><path d="M6 20.5V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16.5M4 20.5h16M14 12h.01" /></svg>
}
function CalcIcon() {
  return <svg {...ic}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h.01M15 11h.01M8 14h.01M12 14h.01M15 14h.01M8 17h4M15 17h.01" /></svg>
}
function PlugIcon() {
  return <svg {...ic}><path d="M9 3v5M15 3v5M6 8h12v2a6 6 0 0 1-12 0zM12 16v5" /></svg>
}
function ShareIcon() {
  return <svg {...ic}><circle cx="6" cy="12" r="2.5" /><circle cx="17.5" cy="6" r="2.5" /><circle cx="17.5" cy="18" r="2.5" /><path d="M8.2 10.8l7.1-3.6M8.2 13.2l7.1 3.6" /></svg>
}
function InfoIcon() {
  return <svg {...ic}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.6h.01" /></svg>
}
function StaffIcon() {
  return <svg {...ic}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.4 20c0-3.2 2.6-5.3 5.6-5.3s5.6 2.1 5.6 5.3" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M17.4 14.9c1.8.6 3.2 2.3 3.2 5.1" /></svg>
}
function SupportIcon() {
  return <svg {...ic}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.3" /><path d="M6.1 6.1l3.5 3.5M14.4 14.4l3.5 3.5M17.9 6.1l-3.5 3.5M9.6 14.4l-3.5 3.5" /></svg>
}
