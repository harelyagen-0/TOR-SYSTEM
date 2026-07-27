import { useState } from 'react'
import { Button, EmptyState, Loading, Sheet } from '../../../components/ui'
import { fmt, he } from '../../../locale/he'
import { formatMoney, formatShortDate, monthKey } from '../../../lib/format'
import { useTenant } from '../../../tenant/TenantProvider'
import { sumLedger, useLedger, usePastReports, useResendReport } from '../../../data/reports'
import type { LedgerLineKind } from '../../../types/models'

/**
 * §8.3 — the accountant ledger is RUNNING: every payment/refund/expense wrote
 * a line when it happened. This sheet shows the current month so far, the past
 * compiled reports (auto-emailed monthly by the scheduled function), and a
 * manual re-send.
 */
export function ReportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const period = monthKey(new Date(), tenant.timezone)
  const ledger = useLedger(period)
  const reports = usePastReports()
  const resend = useResendReport()
  const [resent, setResent] = useState<string | null>(null)

  const totals = sumLedger(ledger.data ?? [])

  const kindLabel: Record<LedgerLineKind, string> = {
    payment: he.report.linePayment,
    refund: he.report.lineRefund,
    expense: he.report.lineExpense,
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.report.title} subtitle={he.report.autoNote}>
      {/* current month totals — numbers are the hero */}
      <section>
        <h3 className="mb-2 border-b border-hair pb-1.5 text-sm font-bold text-muted">
          {he.report.currentMonth} · <bdi className="tnum">{period}</bdi>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <TotalCell label={he.report.income} value={formatMoney(totals.income, tenant.currency, tenant.locale)} />
          <TotalCell label={he.report.expenses} value={formatMoney(totals.expenses, tenant.currency, tenant.locale)} />
          <TotalCell label={he.report.refunds} value={formatMoney(totals.refunds, tenant.currency, tenant.locale)} />
          <TotalCell label={he.report.net} value={formatMoney(totals.net, tenant.currency, tenant.locale)} strong />
        </div>
      </section>

      {/* running ledger lines */}
      <section>
        {ledger.isLoading ? (
          <Loading />
        ) : (ledger.data ?? []).length === 0 ? (
          <EmptyState title={he.report.empty} />
        ) : (
          <div className="flex flex-col">
            {(ledger.data ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{l.description || kindLabel[l.kind]}</p>
                  <p className="text-xs text-faint">
                    {kindLabel[l.kind]} · {formatShortDate(l.createdAt, tenant.timezone, tenant.locale)}
                    {l.invoiceId && (
                      <> · {he.payments.invoice} <bdi className="tnum">{l.invoiceId.replace(/^inv-/, '')}</bdi></>
                    )}
                  </p>
                </div>
                <p className={`shrink-0 font-bold tnum ${l.amount < 0 ? 'text-crit' : 'text-ok'}`}>
                  <bdi>{formatMoney(l.amount, tenant.currency, tenant.locale)}</bdi>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* past reports + manual re-send */}
      <section>
        <h3 className="mb-2 border-b border-hair pb-1.5 text-sm font-bold text-muted">{he.report.pastReports}</h3>
        {(reports.data ?? []).length === 0 ? (
          <p className="text-sm text-faint">—</p>
        ) : (
          <div className="flex flex-col">
            {(reports.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm last:border-0">
                <div>
                  <p className="font-bold tnum"><bdi>{r.period}</bdi></p>
                  <p className="text-xs text-faint">
                    {r.sentAt
                      ? fmt(he.report.sentAt, { date: formatShortDate(r.sentAt, tenant.timezone, tenant.locale) })
                      : '—'}
                    {' · '}
                    <bdi className="tnum">{formatMoney(r.totals.net, tenant.currency, tenant.locale)}</bdi>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="!min-h-9 px-3"
                  disabled={resend.isPending}
                  onClick={async () => {
                    await resend.mutateAsync(r.period)
                    setResent(r.period)
                  }}
                >
                  {resent === r.period ? '✓' : he.report.resend}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </Sheet>
  )
}

function TotalCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-field border p-3 text-center ${strong ? 'border-accent/40 bg-accent/5' : 'border-line bg-page/60'}`}>
      <span className="text-base font-bold tnum"><bdi>{value}</bdi></span>
      <span className="text-[0.6875rem] font-semibold text-muted">{label}</span>
    </div>
  )
}
