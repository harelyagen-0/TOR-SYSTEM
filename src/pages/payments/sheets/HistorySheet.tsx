import { useMemo, useState } from 'react'
import { Button, ConfirmDialog, EmptyState, Loading, SearchInput, Sheet } from '../../../components/ui'
import { he } from '../../../locale/he'
import { formatMoney, formatShortDate } from '../../../lib/format'
import { useTenant } from '../../../tenant/TenantProvider'
import { filterCustomers, useCustomerPayments, useCustomers } from '../../../data/customers'
import { useMarkPaid, useRecordRefund } from '../../../data/payments'
import { PaymentStatusPill } from '../../customers/CustomerProfileSheet'
import type { Customer, Payment } from '../../../types/models'

/**
 * §8.2.2 — search a customer by name or phone, see every payment (product,
 * date, amount, invoice) with a per-transaction REFUND action. A refund issues
 * a credit invoice and posts a negative ledger line (Cloud Function).
 */
export function HistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const customers = useCustomers()
  const [q, setQ] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const payments = useCustomerPayments(customer?.id ?? null)
  const refund = useRecordRefund()
  const markPaid = useMarkPaid()
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)

  const matches = useMemo(
    () => filterCustomers(customers.data ?? [], q).slice(0, 6),
    [customers.data, q],
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={he.payments.historyTitle}
      subtitle={he.payments.historySearchHint}
    >
      <SearchInput
        placeholder={he.payments.searchPlaceholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setCustomer(null) }}
      />

      {!customer ? (
        customers.isLoading ? (
          <Loading />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-field border border-line">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomer(c)}
                className="flex min-h-12 items-center gap-3 border-b border-hair px-3 text-start last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.firstName} {c.lastName}</span>
                  <span className="block text-xs text-faint"><bdi>{c.phone}</bdi> · {c.publicId}</span>
                </span>
              </button>
            ))}
            {matches.length === 0 && <p className="px-3 py-4 text-center text-sm text-faint">{he.common.noResults}</p>}
          </div>
        )
      ) : (
        <>
          <div className="flex items-center justify-between rounded-field bg-accent/8 px-3 py-2">
            <p className="text-sm font-bold">{customer.firstName} {customer.lastName}</p>
            <button type="button" className="text-xs font-bold text-accent" onClick={() => setCustomer(null)}>
              {he.common.back}
            </button>
          </div>

          {payments.isLoading ? (
            <Loading />
          ) : (payments.data ?? []).length === 0 ? (
            <EmptyState title={he.payments.historyEmpty} />
          ) : (
            <div className="flex flex-col">
              {(payments.data ?? []).map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5 border-b border-hair py-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-bold">{p.productSnapshot.name}</p>
                    <p className={`shrink-0 text-sm font-bold tnum ${p.amount < 0 ? 'text-crit' : ''}`}>
                      <bdi>{formatMoney(p.amount, tenant.currency, tenant.locale)}</bdi>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                    <PaymentStatusPill status={p.status} />
                    <span>{formatShortDate(p.createdAt, tenant.timezone, tenant.locale)}</span>
                    {p.invoiceId && (
                      <span className="font-semibold">
                        {he.payments.invoice} <bdi className="tnum">{p.invoiceId.replace(/^inv-/, '')}</bdi>
                      </span>
                    )}
                    {/* a pending (unfinished link / cash owed) payment can be marked paid */}
                    {p.status === 'pending' && (
                      <Button
                        variant="ghost"
                        className="ms-auto !min-h-9 px-3 text-ok"
                        disabled={markPaid.isPending}
                        onClick={() => markPaid.mutate(p.id)}
                      >
                        {he.payments.markPaid}
                      </Button>
                    )}
                    {/* refund only a positive, paid charge — pending/refunded rows don't offer it */}
                    {p.status === 'paid' && p.amount > 0 && (
                      <Button
                        variant="ghost"
                        className="ms-auto !min-h-9 px-3 text-crit"
                        onClick={() => setRefundTarget(p)}
                      >
                        {he.payments.refund}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={refundTarget !== null}
        busy={refund.isPending}
        question={he.payments.refundTitle}
        detail={
          refundTarget
            ? `${refundTarget.productSnapshot.name} · ${formatMoney(refundTarget.amount, tenant.currency, tenant.locale)} — ${he.payments.refundWarning}`
            : undefined
        }
        onNo={() => setRefundTarget(null)}
        onYes={async () => {
          if (refundTarget) await refund.mutateAsync({ paymentId: refundTarget.id })
          setRefundTarget(null)
        }}
      />
    </Sheet>
  )
}
