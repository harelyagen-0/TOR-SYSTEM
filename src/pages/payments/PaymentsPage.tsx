import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SectionTitle } from '../../components/ui'
import { he } from '../../locale/he'
import { useAuth } from '../../auth/AuthProvider'
import { CollectCard } from './CollectCard'
import { ProductSheet } from './sheets/ProductSheet'
import { HistorySheet } from './sheets/HistorySheet'
import { PromoSheet } from './sheets/PromoSheet'
import { ExpensesSheet } from './sheets/ExpensesSheet'
import { ReportSheet } from './sheets/ReportSheet'

type SheetId = 'product' | 'history' | 'promo' | 'expenses' | 'report' | null

/**
 * §8 — the collection card is always visible and first; six action buttons
 * open bottom sheets beneath it.
 *
 * Button 5 is [OPEN] in the spec; the suggested "מנויים פעילים" is used and
 * routes to the customers page in subscription view.
 */
export function PaymentsPage() {
  const [sheet, setSheet] = useState<SheetId>(null)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = useAuth()

  // the page hosts two areas: the sale tiles are `payments`, while expenses
  // and the accountant report are `finance`
  const canPayments = can('payments', 'view')
  const canSell = can('payments', 'edit')
  const canFinance = can('finance', 'view')

  // deep links from Home: ?action=collect (the card is already first and
  // open) · ?action=expense (open the expenses sheet)
  useEffect(() => {
    const action = params.get('action')
    if (!action) return
    if (action === 'expense') setSheet('expenses')
    if (action === 'collect') window.scrollTo(0, 0)
    setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <div className="flex flex-col gap-5">
      {canSell && <CollectCard />}

      <section>
        <SectionTitle>{he.common.actions}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {canSell && <ActionTile label={he.payments.actNewProduct} onClick={() => setSheet('product')} icon={<TagIcon />} />}
          {canPayments && <ActionTile label={he.payments.actCustomerHistory} onClick={() => setSheet('history')} icon={<ClockIcon />} />}
          {canSell && <ActionTile label={he.payments.actPromoCodes} onClick={() => setSheet('promo')} icon={<TicketIcon />} />}
          {canFinance && <ActionTile label={he.payments.actExpenses} onClick={() => setSheet('expenses')} icon={<ReceiptIcon />} />}
          {canPayments && <ActionTile label={he.payments.actSubscriptions} onClick={() => navigate('/customers?view=subscribers')} icon={<RepeatIcon />} />}
          {canFinance && <ActionTile label={he.payments.actAccountantReport} onClick={() => setSheet('report')} icon={<FileIcon />} />}
        </div>
      </section>

      <ProductSheet open={sheet === 'product'} onClose={() => setSheet(null)} />
      <HistorySheet open={sheet === 'history'} onClose={() => setSheet(null)} />
      <PromoSheet open={sheet === 'promo'} onClose={() => setSheet(null)} />
      <ExpensesSheet open={sheet === 'expenses'} onClose={() => setSheet(null)} />
      <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} />
    </div>
  )
}

function ActionTile({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-start shadow-sm transition-transform active:scale-[0.98]"
    >
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-field bg-accent/10 text-accent">
        {icon}
      </span>
      <span className="text-sm font-bold leading-tight">{label}</span>
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

function TagIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20.3 13.4l-6.9 6.9a2 2 0 0 1-2.8 0L3.5 13.2V4.5h8.7l8.1 8.1a1 1 0 0 1 0 .8z" />
      <circle cx="7.9" cy="8.3" r="1.2" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.5 2" />
    </svg>
  )
}
function TicketIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3.5 8.5v-2A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v2a2.5 2.5 0 0 0 0 7v2A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-2a2.5 2.5 0 0 0 0-7z" />
      <path d="M9.5 9.5l5 5" />
    </svg>
  )
}
function ReceiptIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  )
}
function RepeatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M17 2.5l3 3-3 3M20 5.5H7a4 4 0 0 0-4 4v1M7 21.5l-3-3 3-3M4 18.5h13a4 4 0 0 0 4-4v-1" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 3.5h7.5L18.5 8v12A1.5 1.5 0 0 1 17 21.5H6A1.5 1.5 0 0 1 4.5 20V5A1.5 1.5 0 0 1 6 3.5z" />
      <path d="M13.5 3.5V8h5M8 13h8M8 17h5" />
    </svg>
  )
}
