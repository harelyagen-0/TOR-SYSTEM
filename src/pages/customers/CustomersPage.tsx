import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Loading,
  Pill,
  SearchInput,
  SectionTitle,
  Sheet,
} from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { formatMoney, formatShortDate } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import {
  filterCustomers,
  useCreateCustomer,
  useCustomers,
  useEntitlements,
} from '../../data/customers'
import { useProducts } from '../../data/products'
import { useSubscriptions, useUpdateSubscriptionStatus } from '../../data/subscriptions'
import type { Customer, Entitlement, Product, Subscription } from '../../types/models'
import { CustomerProfileSheet } from './CustomerProfileSheet'

/** The customer list can be narrowed to holders of subscriptions and/or card
 *  passes; both facets can be active at once, and none active = every customer. */
type Facet = 'subscribers' | 'passes'

export function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [facets, setFacets] = useState<Set<Facet>>(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)

  const filtering = facets.size > 0
  const bothFacets = facets.size > 1

  function toggleFacet(facet: Facet) {
    setFacets((prev) => {
      const next = new Set(prev)
      if (next.has(facet)) next.delete(facet)
      else next.add(facet)
      return next
    })
  }

  // deep links: /customers?action=add (Home) · ?view=subscribers (Payments)
  useEffect(() => {
    const action = params.get('action')
    const viewParam = params.get('view')
    if (!action && !viewParam) return
    if (action === 'add') setAddOpen(true)
    if (viewParam === 'subscribers') setFacets(new Set(['subscribers']))
    if (viewParam === 'passes') setFacets(new Set(['passes']))
    setParams({}, { replace: true })
  }, [params, setParams])

  const customers = useCustomers()
  const filtered = useMemo(
    () => filterCustomers(customers.data ?? [], q),
    [customers.data, q],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* search · add · filter (spec §9) */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            placeholder={he.customers.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          type="button"
          aria-label={he.customers.addTitle}
          onClick={() => setAddOpen(true)}
          className="grid size-12 shrink-0 place-items-center rounded-field bg-primary text-on-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={he.customers.filter}
          aria-pressed={filtering}
          onClick={() => setFilterOpen(true)}
          className={`relative grid size-12 shrink-0 place-items-center rounded-field border ${
            filtering ? 'border-accent text-accent' : 'border-line bg-surface text-muted'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {filtering && (
            <span
              aria-hidden="true"
              className="absolute -end-1 -top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-4 text-on-primary tnum"
            >
              {facets.size}
            </span>
          )}
        </button>
      </div>

      {!filtering ? (
        customers.isLoading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState title={q ? he.common.noResults : he.customers.empty} />
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c) => (
              <CustomerCard key={c.id} customer={c} onOpen={() => setProfileId(c.id)} />
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-5">
          {facets.has('subscribers') && (
            <section>
              {bothFacets && <SectionTitle>{he.customers.filterSubscribers}</SectionTitle>}
              <SubscriptionsView query={q} onOpenCustomer={(id) => setProfileId(id)} />
            </section>
          )}
          {facets.has('passes') && (
            <section>
              {bothFacets && <SectionTitle>{he.customers.filterPunchCards}</SectionTitle>}
              <PassesView query={q} onOpenCustomer={(id) => setProfileId(id)} />
            </section>
          )}
        </div>
      )}

      {/* filter sheet — "all" clears; the two facets toggle and can combine */}
      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={he.customers.filter}
        subtitle={he.customers.filterHint}
        footer={<Button onClick={() => setFilterOpen(false)}>{he.common.confirm}</Button>}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!filtering}
          onClick={() => {
            setFacets(new Set())
            setFilterOpen(false)
          }}
          className={`flex min-h-12 items-center justify-between rounded-field border px-4 text-sm font-semibold ${
            !filtering ? 'border-accent bg-accent/5 text-accent' : 'border-line bg-surface'
          }`}
        >
          {he.customers.filterAll}
          {!filtering && <CheckIcon />}
        </button>

        {(
          [
            ['subscribers', he.customers.filterSubscribers],
            ['passes', he.customers.filterPunchCards],
          ] as const
        ).map(([facet, label]) => {
          const on = facets.has(facet)
          return (
            <button
              key={facet}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggleFacet(facet)}
              className={`flex min-h-12 items-center justify-between rounded-field border px-4 text-sm font-semibold ${
                on ? 'border-accent bg-accent/5 text-accent' : 'border-line bg-surface'
              }`}
            >
              {label}
              {on && <CheckIcon />}
            </button>
          )
        })}
      </Sheet>

      <AddCustomerSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <CustomerProfileSheet
        customerId={profileId}
        onClose={() => setProfileId(null)}
      />
    </div>
  )
}

// ── customer card ───────────────────────────────────────────────────────────
function CustomerCard({ customer, onOpen }: { customer: Customer; onOpen: () => void }) {
  const tenant = useTenant()
  return (
    <button type="button" onClick={onOpen} className="w-full text-start">
      <Card className="flex min-h-16 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent"
        >
          {customer.firstName.charAt(0)}
          {customer.lastName.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {customer.firstName} {customer.lastName}
          </span>
          <span className="block text-xs text-faint">
            <bdi>{customer.phone}</bdi> · {customer.publicId}
          </span>
        </span>
        <span className="shrink-0 text-end">
          <span className="block text-sm font-bold tnum">
            <bdi>{formatMoney(customer.stats.totalSpent, tenant.currency, tenant.locale)}</bdi>
          </span>
          <span className="block text-[0.6875rem] font-semibold text-faint">
            {he.customers.totalSpent}
          </span>
        </span>
      </Card>
    </button>
  )
}

// ── add customer ────────────────────────────────────────────────────────────
function AddCustomerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCustomer()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({ firstName, lastName, phone, email })
    setFirstName(''); setLastName(''); setPhone(''); setEmail('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.customers.addTitle}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={he.payments.firstName}>
            <Input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label={he.payments.lastName}>
            <Input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label={he.payments.phone}>
          <Input required type="tel" inputMode="tel" dir="ltr" className="text-end" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={`${he.payments.email} ${he.common.optional}`}>
          <Input type="email" inputMode="email" dir="ltr" className="text-end" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="mt-1 flex gap-3 [&>*]:flex-1">
          <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
          <Button type="submit" disabled={create.isPending}>{he.common.save}</Button>
        </div>
      </form>
    </Sheet>
  )
}

// ── subscription view (spec §9) ─────────────────────────────────────────────
function SubscriptionsView({
  query,
  onOpenCustomer,
}: {
  query: string
  onOpenCustomer: (customerId: string) => void
}) {
  const tenant = useTenant()
  const customers = useCustomers()
  const subs = useSubscriptions()
  const update = useUpdateSubscriptionStatus()
  const [cancelId, setCancelId] = useState<string | null>(null)

  const byId = useMemo(
    () => new Map((customers.data ?? []).map((c) => [c.id, c])),
    [customers.data],
  )

  const visible = useMemo(() => {
    const list = (subs.data ?? []).filter((s) => s.status !== 'cancelled')
    if (!query.trim()) return list
    const matching = new Set(filterCustomers(customers.data ?? [], query).map((c) => c.id))
    return list.filter((s) => matching.has(s.customerId))
  }, [subs.data, customers.data, query])

  if (subs.isLoading || customers.isLoading) return <Loading />
  if (visible.length === 0) return <EmptyState title={he.customers.subEmpty} />

  return (
    <div className="flex flex-col gap-2">
      {visible.map((s) => (
        <SubscriptionCard
          key={s.id}
          sub={s}
          customer={byId.get(s.customerId)}
          currency={tenant.currency}
          locale={tenant.locale}
          tz={tenant.timezone}
          onOpenCustomer={onOpenCustomer}
          onPauseToggle={() =>
            update.mutate({ id: s.id, status: s.status === 'paused' ? 'active' : 'paused' })
          }
          onCancel={() => setCancelId(s.id)}
        />
      ))}
      <ConfirmDialog
        open={cancelId !== null}
        question={he.customers.subCancelConfirm}
        onNo={() => setCancelId(null)}
        onYes={() => {
          if (cancelId) update.mutate({ id: cancelId, status: 'cancelled' })
          setCancelId(null)
        }}
      />
    </div>
  )
}

function SubscriptionCard({
  sub,
  customer,
  currency,
  locale,
  tz,
  onOpenCustomer,
  onPauseToggle,
  onCancel,
}: {
  sub: Subscription
  customer: Customer | undefined
  currency: string
  locale: string
  tz: string
  onOpenCustomer: (id: string) => void
  onPauseToggle: () => void
  onCancel: () => void
}) {
  // subscription length in whole months, derived from start → end
  const months = sub.endsAt
    ? Math.max(1, Math.round((sub.endsAt.toMillis() - sub.startedAt.toMillis()) / (30 * 86400_000)))
    : null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => customer && onOpenCustomer(customer.id)}
          className="min-w-0 text-start"
        >
          <span className="block truncate text-sm font-bold">
            {customer ? `${customer.firstName} ${customer.lastName}` : '—'}
          </span>
          {customer && (
            <span className="block text-xs text-faint">
              <bdi>{customer.phone}</bdi> · {customer.publicId}
            </span>
          )}
        </button>
        {sub.status === 'paused' ? (
          <Pill tone="warn">{he.customers.subPaused}</Pill>
        ) : (
          <Pill tone="ok">{he.customers.subActive}</Pill>
        )}
      </div>

      <p className="text-sm font-semibold">
        {sub.productSnapshot.name} ·{' '}
        <bdi className="tnum">{formatMoney(sub.productSnapshot.price, currency, locale)}</bdi>
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <SubRow label={he.customers.subPurchased} value={formatShortDate(sub.startedAt, tz, locale)} />
        <SubRow label={he.customers.subNextCharge} value={formatShortDate(sub.nextChargeAt, tz, locale)} />
        <SubRow
          label={he.customers.subLength}
          value={months === null ? '—' : months === 1 ? he.customers.subMonth : fmt(he.customers.subMonths, { n: months })}
        />
        <SubRow
          label={he.customers.subEnds}
          value={sub.endsAt ? formatShortDate(sub.endsAt, tz, locale) : '—'}
        />
      </dl>

      <div className="flex gap-2 [&>*]:flex-1">
        <Button variant="ghost" onClick={onPauseToggle}>
          {sub.status === 'paused' ? he.customers.subResume : he.customers.subPause}
        </Button>
        <Button variant="ghost" className="text-crit" onClick={onCancel}>
          {he.customers.subCancel}
        </Button>
      </div>
    </Card>
  )
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-hair py-1 last:border-0">
      <dt className="text-faint">{label}</dt>
      <dd className="font-bold tnum"><bdi>{value}</bdi></dd>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

// ── card-pass (punch-card) view ─────────────────────────────────────────────
// Mirrors the subscription view, but over active punch-card entitlements: one
// card per live pass, showing the customer, the product and the balance left.
function PassesView({
  query,
  onOpenCustomer,
}: {
  query: string
  onOpenCustomer: (customerId: string) => void
}) {
  const tenant = useTenant()
  const customers = useCustomers()
  const entitlements = useEntitlements()
  const products = useProducts(false)

  const byId = useMemo(
    () => new Map((customers.data ?? []).map((c) => [c.id, c])),
    [customers.data],
  )
  const productById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  )

  const visible = useMemo(() => {
    const list = (entitlements.data ?? []).filter(
      (e) => e.kind === 'punchCard' && e.status === 'active' && (e.remaining ?? 0) > 0,
    )
    if (!query.trim()) return list
    const matching = new Set(filterCustomers(customers.data ?? [], query).map((c) => c.id))
    return list.filter((e) => matching.has(e.customerId))
  }, [entitlements.data, customers.data, query])

  if (entitlements.isLoading || customers.isLoading) return <Loading />
  if (visible.length === 0) return <EmptyState title={he.customers.passEmpty} />

  return (
    <div className="flex flex-col gap-2">
      {visible.map((e) => (
        <PassCard
          key={e.id}
          ent={e}
          customer={byId.get(e.customerId)}
          product={productById.get(e.productId)}
          currency={tenant.currency}
          locale={tenant.locale}
          tz={tenant.timezone}
          onOpenCustomer={onOpenCustomer}
        />
      ))}
    </div>
  )
}

function PassCard({
  ent,
  customer,
  product,
  currency,
  locale,
  tz,
  onOpenCustomer,
}: {
  ent: Entitlement
  customer: Customer | undefined
  product: Product | undefined
  currency: string
  locale: string
  tz: string
  onOpenCustomer: (id: string) => void
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => customer && onOpenCustomer(customer.id)}
          className="min-w-0 text-start"
        >
          <span className="block truncate text-sm font-bold">
            {customer ? `${customer.firstName} ${customer.lastName}` : '—'}
          </span>
          {customer && (
            <span className="block text-xs text-faint">
              <bdi>{customer.phone}</bdi> · {customer.publicId}
            </span>
          )}
        </button>
        <Pill tone="ok">{fmt(he.customers.punchesLeft, { n: ent.remaining ?? 0 })}</Pill>
      </div>

      {product && (
        <p className="text-sm font-semibold">
          {product.name} ·{' '}
          <bdi className="tnum">{formatMoney(product.price, currency, locale)}</bdi>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <SubRow label={he.customers.subPurchased} value={formatShortDate(ent.createdAt, tz, locale)} />
        <SubRow
          label={he.customers.passExpires}
          value={ent.expiresAt ? formatShortDate(ent.expiresAt, tz, locale) : '—'}
        />
      </dl>
    </Card>
  )
}
