import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Loading, Pill, Sheet } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { formatMoney, formatShortDate, formatTime } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import {
  isEntitlementLive,
  useCustomerEntitlements,
  useCustomerPayments,
  useCustomerRegistrations,
  useCustomers,
  useUpdateCustomer,
  type RegistrationHistoryRow,
} from '../../data/customers'
import type { Payment, Registration } from '../../types/models'
import { swallow } from '../../lib/errors'

/**
 * Customer profile (spec §9): details (editable), stats, payment history,
 * active entitlements (punch-card balances), attendance.
 */
export function CustomerProfileSheet({
  customerId,
  onClose,
}: {
  customerId: string | null
  onClose: () => void
}) {
  const tenant = useTenant()
  const customers = useCustomers()
  const customer = useMemo(
    () => (customers.data ?? []).find((c) => c.id === customerId) ?? null,
    [customers.data, customerId],
  )

  const payments = useCustomerPayments(customerId)
  const entitlements = useCustomerEntitlements(customerId)
  const registrations = useCustomerRegistrations(customerId)
  const update = useUpdateCustomer()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', notes: '' })

  useEffect(() => {
    if (customer) {
      setForm({
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        email: customer.email ?? '',
        notes: customer.notes ?? '',
      })
      setEditing(false)
    }
  }, [customer])

  const open = customerId !== null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={customer ? `${customer.firstName} ${customer.lastName}` : he.customers.profileTitle}
      subtitle={customer ? `${customer.publicId}` : undefined}
    >
      {!customer ? (
        <Loading />
      ) : (
        <>
          {/* stats — numbers are the hero */}
          <div className="grid grid-cols-3 gap-2">
            <ProfileStat
              value={formatMoney(customer.stats.totalSpent, tenant.currency, tenant.locale)}
              label={he.customers.totalSpent}
            />
            <ProfileStat
              value={String(customer.stats.sessionsAttended)}
              label={he.customers.sessionsAttended}
            />
            <ProfileStat
              value={
                customer.stats.lastVisitAt
                  ? formatShortDate(customer.stats.lastVisitAt, tenant.timezone, tenant.locale)
                  : '—'
              }
              label={he.customers.lastVisit}
            />
          </div>

          {/* details (all editable later — spec §9) */}
          <section>
            <SheetSectionTitle
              title={he.customers.details}
              action={
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="text-xs font-bold text-accent"
                >
                  {editing ? he.common.cancel : he.common.edit}
                </button>
              }
            />
            {editing ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await update.mutateAsync({ id: customer.id, ...form }).catch(swallow)
                  setEditing(false)
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label={he.payments.firstName}>
                    <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  </Field>
                  <Field label={he.payments.lastName}>
                    <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </Field>
                </div>
                <Field label={he.payments.phone}>
                  <Input required type="tel" dir="ltr" className="text-end" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label={`${he.payments.email} ${he.common.optional}`}>
                  <Input type="email" dir="ltr" className="text-end" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label={he.customers.notes}>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
                <Button type="submit" disabled={update.isPending}>{he.common.save}</Button>
              </form>
            ) : (
              <dl className="flex flex-col text-sm">
                <DetailRow label={he.payments.phone} value={customer.phone} ltr />
                <DetailRow label={he.payments.email} value={customer.email || '—'} ltr />
                <DetailRow label={he.customers.notes} value={customer.notes || '—'} />
              </dl>
            )}
          </section>

          {/* entitlements — punch-card balances */}
          {(entitlements.data ?? []).filter((e) => isEntitlementLive(e)).length > 0 && (
            <section>
              <SheetSectionTitle title={he.customers.entitlements} />
              <div className="flex flex-col gap-2">
                {(entitlements.data ?? [])
                  .filter((e) => isEntitlementLive(e))
                  .map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-field border border-line bg-page/60 px-3 py-2.5 text-sm">
                      <span className="font-bold">
                        {e.kind === 'punchCard'
                          ? fmt(he.customers.punchesLeft, { n: e.remaining ?? 0 })
                          : he.products.kindSubscription}
                      </span>
                      {e.expiresAt && (
                        <span className="text-xs text-faint">
                          {fmt(he.customers.expiresAt, {
                            date: formatShortDate(e.expiresAt, tenant.timezone, tenant.locale),
                          })}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* payment history */}
          <section>
            <SheetSectionTitle title={he.customers.paymentHistory} />
            {payments.isLoading ? (
              <Loading />
            ) : (payments.data ?? []).length === 0 ? (
              <p className="text-sm text-faint">{he.payments.historyEmpty}</p>
            ) : (
              <div className="flex flex-col">
                {(payments.data ?? []).map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </div>
            )}
          </section>

          {/* activity — every class registration, by date */}
          <section>
            <SheetSectionTitle title={he.customers.activity} />
            {registrations.isLoading ? (
              <Loading />
            ) : (registrations.data ?? []).length === 0 ? (
              <p className="text-sm text-faint">—</p>
            ) : (
              <div className="flex flex-col">
                {(registrations.data ?? []).slice(0, 15).map((row) => (
                  <ActivityRow key={row.registration.id} row={row} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Sheet>
  )
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-field border border-line bg-page/60 p-3 text-center">
      <span className="text-base font-bold tnum"><bdi>{value}</bdi></span>
      <span className="text-[0.6875rem] font-semibold text-muted">{label}</span>
    </div>
  )
}

function SheetSectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between border-b border-hair pb-1.5">
      <h3 className="text-sm font-bold text-muted">{title}</h3>
      {action}
    </div>
  )
}

function DetailRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair py-2 last:border-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate font-semibold">{ltr ? <bdi>{value}</bdi> : value}</dd>
    </div>
  )
}

function PaymentRow({ payment }: { payment: Payment }) {
  const tenant = useTenant()
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm last:border-0">
      <div className="min-w-0">
        <p className="truncate font-semibold">{payment.productSnapshot.name}</p>
        <p className="text-xs text-faint">
          {formatShortDate(payment.createdAt, tenant.timezone, tenant.locale)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <PaymentStatusPill status={payment.status} />
        <span className={`font-bold tnum ${payment.amount < 0 ? 'text-crit' : ''}`}>
          <bdi>{formatMoney(payment.amount, tenant.currency, tenant.locale)}</bdi>
        </span>
      </div>
    </div>
  )
}

export function PaymentStatusPill({ status }: { status: Payment['status'] }) {
  if (status === 'paid') return <Pill tone="ok">{he.payments.statusPaid}</Pill>
  if (status === 'pending') return <Pill tone="accent">{he.payments.statusPending}</Pill>
  return <Pill tone="muted">{he.payments.statusRefunded}</Pill>
}

/** One class in the activity log: the class + date, what happened, and how it
 *  was covered (cash / card / punch / subscription). */
function ActivityRow({ row }: { row: RegistrationHistoryRow }) {
  const tenant = useTenant()
  const { registration: r, session } = row
  const title = session?.title ?? he.customers.activity
  const when = session
    ? `${formatShortDate(session.startAt, tenant.timezone, tenant.locale)} · ${formatTime(session.startAt, tenant.timezone, tenant.locale)}`
    : formatShortDate(r.createdAt, tenant.timezone, tenant.locale)
  const coverage = coverageLabel(r)
  // a late cancellation that carried a charge, or an attended class, shows how it was paid
  const meta = r.status === 'cancelled' && r.lateCancel && coverage
    ? `${he.customers.charged} · ${coverage}`
    : coverage
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm last:border-0">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="text-xs text-faint">{when}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <RegistrationPill status={r.status} lateCancel={r.lateCancel} />
        {meta && <span className="text-xs text-faint">{meta}</span>}
      </div>
    </div>
  )
}

/** Human label for how a registration was covered (empty when nothing was consumed). */
function coverageLabel(r: Registration): string {
  const c = r.coverage
  if (!c) return ''
  if (c.kind === 'punchCard') return he.customers.coverPunch
  if (c.kind === 'subscription') return he.customers.coverSubscription
  if (c.method === 'cash') return he.customers.coverCash
  if (c.method === 'card') return he.customers.coverCard
  return c.otherMethodLabel?.trim() || he.payments.methodOther
}

function RegistrationPill({ status, lateCancel }: { status: Registration['status']; lateCancel?: boolean }) {
  if (status === 'attended') return <Pill tone="ok">{he.customers.regAttended}</Pill>
  if (status === 'noShow') return <Pill tone="warn">{he.customers.regNoShow}</Pill>
  if (status === 'cancelled')
    return lateCancel
      ? <Pill tone="crit">{he.customers.regCancelledLate}</Pill>
      : <Pill tone="muted">{he.customers.regCancelled}</Pill>
  return <Pill tone="accent">{he.customers.regBooked}</Pill>
}
