import { useState, type ReactNode } from 'react'
import { Button, Card, SectionTitle } from '../../components/ui'
import { he } from '../../locale/he'
import { useAuth } from '../../auth/AuthProvider'
import { StudioSheet } from './StudioSheet'
import { ClassTypesSheet } from './ClassTypesSheet'
import { PoliciesSheet } from './PoliciesSheet'
import { StaffSheet } from './StaffSheet'

type SheetId = 'studio' | 'classTypes' | 'policies' | 'staff' | null

/**
 * The settings hub: rows open bottom sheets, the same shape PaymentsPage uses
 * for its six actions.
 *
 * Configuration sections need settings:view (the tenant doc write itself needs
 * settings:edit, enforced in firestore.rules). The account card is always
 * shown — every operator needs a way out of the app, and until now the app had
 * no sign-out control at all.
 */
export function SettingsPage() {
  const { can, role, user, signOutUser } = useAuth()
  const [sheet, setSheet] = useState<SheetId>(null)
  const canSeeSettings = can('settings', 'view')

  return (
    <div className="flex flex-col gap-5">
      {canSeeSettings && (
        <section>
          <SectionTitle>{he.settings.title}</SectionTitle>
          <div className="flex flex-col gap-3">
            <SettingsRow
              title={he.settings.studioSection}
              subtitle={he.settings.studioSectionSub}
              onClick={() => setSheet('studio')}
              icon={<StudioIcon />}
            />
            <SettingsRow
              title={he.settings.classTypesSection}
              subtitle={he.settings.classTypesSectionSub}
              onClick={() => setSheet('classTypes')}
              icon={<PaletteIcon />}
            />
            <SettingsRow
              title={he.settings.policiesSection}
              subtitle={he.settings.policiesSectionSub}
              onClick={() => setSheet('policies')}
              icon={<RulesIcon />}
            />
            <SettingsRow
              title={he.settings.staffSection}
              subtitle={he.settings.staffSectionSub}
              onClick={() => setSheet('staff')}
              icon={<StaffIcon />}
            />
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{he.settings.accountSection}</SectionTitle>
        <Card>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">{he.settings.signedInAs}</span>
            <span className="truncate text-sm font-bold" dir="ltr">
              {user?.email ?? ''}
            </span>
            {role && (
              <span className="mt-1 text-xs font-semibold text-muted">
                {he.settings.yourRole}: {he.roles[role]}
              </span>
            )}
          </div>
          <Button variant="ghost" className="mt-4 w-full" onClick={() => void signOutUser()}>
            {he.auth.signOut}
          </Button>
        </Card>
      </section>

      {canSeeSettings && (
        <>
          <StudioSheet open={sheet === 'studio'} onClose={() => setSheet(null)} />
          <ClassTypesSheet open={sheet === 'classTypes'} onClose={() => setSheet(null)} />
          <PoliciesSheet open={sheet === 'policies'} onClose={() => setSheet(null)} />
          <StaffSheet open={sheet === 'staff'} onClose={() => setSheet(null)} />
        </>
      )}
    </div>
  )
}

function SettingsRow({
  title,
  subtitle,
  onClick,
  icon,
}: {
  title: string
  subtitle: string
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-start shadow-sm transition-transform active:scale-[0.98]"
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-field bg-accent/10 text-accent"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>
      </span>
      <ChevronIcon />
    </button>
  )
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'size-5',
  'aria-hidden': true,
} as const

function StudioIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <circle cx="12" cy="13.5" r="2.5" />
    </svg>
  )
}
function PaletteIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.6 1-2 2.2-2h1.3a3.2 3.2 0 0 0 3.2-3.2C20.5 7.7 16.7 3.5 12 3.5z" />
      <circle cx="8" cy="10" r="1" />
      <circle cx="12" cy="7.8" r="1" />
      <circle cx="16" cy="10" r="1" />
    </svg>
  )
}
function RulesIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path d="M8.5 8.5h7M8.5 12.5h7M8.5 16.5h4" />
    </svg>
  )
}
function StaffIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.3 20c0-3.2 2.6-5.3 5.7-5.3s5.7 2.1 5.7 5.3" />
      <path d="M16.2 5.8a3.2 3.2 0 0 1 0 5.7M17.5 15.2c1.8.7 3.1 2.3 3.1 4.8" />
    </svg>
  )
}
/** RTL: the disclosure arrow points to the physical left (the end side). */
function ChevronIcon() {
  return (
    <svg {...iconProps} className="size-4.5 shrink-0 text-faint">
      <path d="M14 6l-6 6 6 6" />
    </svg>
  )
}
