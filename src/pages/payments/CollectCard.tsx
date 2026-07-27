import { useMemo, useState } from 'react'
import { Button, Card, Field, Input, Loading, OptionTile, SearchInput } from '../../components/ui'
import { fmt, he } from '../../locale/he'
import { formatMoney } from '../../lib/format'
import { useTenant } from '../../tenant/TenantProvider'
import { filterCustomers, useCreateCustomer, useCustomers } from '../../data/customers'
import { useProducts } from '../../data/products'
import { useConsumePromo, usePromoCodes, validatePromo, type PromoValidation } from '../../data/promoCodes'
import { useCreatePayment, useWatchPayment } from '../../data/payments'
import { getMessageSender, getPaymentProvider } from '../../integrations'
import type { Customer, Product } from '../../types/models'

type WhoMode = 'existing' | 'new' | 'walkIn'
type Method = 'cash' | 'card' | 'other'
type CardMode = 'charge' | 'link'

/**
 * §8.1 — the primary card, always visible: who pays → what they buy (product
 * required, optional promo) → how they pay (Grow card / cash / other) →
 * receipt with email/WhatsApp send. Ledger + invoice + entitlement effects are
 * server-side (Cloud Function on the payment doc).
 */
export function CollectCard() {
  const tenant = useTenant()
  const customers = useCustomers()
  const products = useProducts()
  const promos = usePromoCodes()
  const createCustomer = useCreateCustomer()
  const createPayment = useCreatePayment()
  const consumePromo = useConsumePromo()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [busy, setBusy] = useState(false)

  // step 1 — who
  const [who, setWho] = useState<WhoMode>('existing')
  const [custQuery, setCustQuery] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newC, setNewC] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [walkIn, setWalkIn] = useState({ name: '', phone: '', email: '' })
  const walkInName = walkIn.name

  // step 2 — cart (productId → quantity) + promo
  const [cart, setCart] = useState<Record<string, number>>({})
  const [promoTyped, setPromoTyped] = useState('')
  const [promoState, setPromoState] = useState<PromoValidation | null>(null)

  const productById = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data],
  )
  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, quantity]) => ({ product: productById.get(id), quantity }))
        .filter((l): l is { product: Product; quantity: number } => !!l.product),
    [cart, productById],
  )
  const cartTotal = useMemo(
    () => cartLines.reduce((s, l) => s + l.product.price * l.quantity, 0),
    [cartLines],
  )
  const cartCount = cartLines.reduce((s, l) => s + l.quantity, 0)
  const cartSummary = cartLines
    .map((l) => (l.quantity > 1 ? `${l.product.name} ×${l.quantity}` : l.product.name))
    .join(' · ')

  function setQty(id: string, q: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, q) }))
    setPromoState(null) // cart changed → any applied promo must be re-checked
  }

  // step 3 — method
  const [method, setMethod] = useState<Method>('card')
  const [cardMode, setCardMode] = useState<CardMode>('charge')
  const [otherLabel, setOtherLabel] = useState('')

  // step 4 — receipt
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [sent, setSent] = useState<'email' | 'whatsapp' | null>(null)
  const watched = useWatchPayment(paymentId)

  const amount = useMemo(
    () => (promoState?.ok ? promoState.discountedAmount : cartTotal),
    [promoState, cartTotal],
  )

  const matches = useMemo(
    () => filterCustomers(customers.data ?? [], custQuery).slice(0, 5),
    [customers.data, custQuery],
  )

  const payerName =
    who === 'existing'
      ? customer
        ? `${customer.firstName} ${customer.lastName}`
        : ''
      : who === 'new'
        ? `${newC.firstName} ${newC.lastName}`.trim()
        : walkInName

  const step1Valid =
    who === 'existing' ? !!customer : who === 'new' ? !!(newC.firstName && newC.phone) : !!walkInName.trim()
  const step3Valid = method !== 'other' || !!otherLabel.trim()

  function applyPromo() {
    if (cartLines.length === 0) return
    const lines = cartLines.map((l) => ({ productId: l.product.id, price: l.product.price, quantity: l.quantity }))
    setPromoState(validatePromo(promos.data ?? [], promoTyped, who, lines))
  }

  async function complete() {
    if (cartLines.length === 0 || busy) return
    setBusy(true)
    try {
      // a NEW customer becomes a real customer record first (spec §8.1)
      let customerId = who === 'existing' ? customer?.id : undefined
      if (who === 'new') {
        const created = await createCustomer.mutateAsync({
          firstName: newC.firstName,
          lastName: newC.lastName,
          phone: newC.phone,
          email: newC.email,
        })
        customerId = created.id
      }

      const provider = getPaymentProvider(tenant)
      let status: 'pending' | 'paid' = 'paid'
      let growTransactionId: string | undefined
      if (method === 'card') {
        if (cardMode === 'charge') {
          const res = await provider.charge(amount, cartSummary)
          growTransactionId = res.transactionId
        } else {
          const res = await provider.createPaymentLink(amount, cartSummary)
          growTransactionId = res.transactionId
          setPaymentLink(res.url)
          status = 'pending' // paid only when the customer completes the Grow form
        }
      }

      const id = await createPayment.mutateAsync({
        customerId,
        walkInName: who === 'walkIn' ? walkInName.trim() : undefined,
        walkInPhone: who === 'walkIn' ? walkIn.phone.trim() || undefined : undefined,
        walkInEmail: who === 'walkIn' ? walkIn.email.trim() || undefined : undefined,
        items: cartLines,
        amount,
        promoCodeId: promoState?.ok ? promoState.promo.id : undefined,
        method,
        otherMethodLabel: method === 'other' ? otherLabel.trim() : undefined,
        status,
        growTransactionId,
      })
      if (promoState?.ok) await consumePromo.mutateAsync(promoState.promo.id)
      setPaymentId(id)
      setStep(4)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep(1)
    setWho('existing'); setCustomer(null); setCustQuery('')
    setNewC({ firstName: '', lastName: '', phone: '', email: '' }); setWalkIn({ name: '', phone: '', email: '' })
    setCart({}); setPromoTyped(''); setPromoState(null)
    setMethod('card'); setCardMode('charge'); setOtherLabel('')
    setPaymentId(null); setPaymentLink(null); setSent(null)
  }

  const contactEmail = who === 'existing' ? customer?.email : who === 'new' ? newC.email : walkIn.email
  const contactPhone = who === 'existing' ? customer?.phone : who === 'new' ? newC.phone : walkIn.phone

  async function send(kind: 'email' | 'whatsapp') {
    const sender = getMessageSender(tenant)
    if (kind === 'email' && contactEmail?.trim()) {
      await sender.sendEmail(contactEmail.trim(), he.payments.receiptTitle, payerName)
      setSent('email')
    } else if (kind === 'whatsapp' && contactPhone?.trim()) {
      await sender.sendWhatsApp(contactPhone.trim(), he.payments.receiptTitle)
      setSent('whatsapp')
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-bold">{he.payments.collectTitle}</h2>
        <span className="text-xs font-bold text-faint">
          {step === 4 ? he.payments.done : fmt(he.payments.stepOf, { n: step, total: 3 })}
        </span>
      </div>
      <div aria-hidden="true" className="mb-4 flex gap-1">
        {[1, 2, 3].map((s) => (
          <span key={s} className={`h-0.75 flex-1 rounded-full ${step >= s ? 'bg-accent' : 'bg-hair'}`} />
        ))}
      </div>

      {/* ── step 1 · who pays ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={he.payments.whoTitle}>
            <p className="text-sm font-bold">{he.payments.whoTitle}</p>
            <OptionTile selected={who === 'existing'} onSelect={() => setWho('existing')} title={he.payments.whoExisting} subtitle={he.payments.whoExistingSub} />
            <OptionTile selected={who === 'new'} onSelect={() => setWho('new')} title={he.payments.whoNew} subtitle={he.payments.whoNewSub} />
            <OptionTile selected={who === 'walkIn'} onSelect={() => setWho('walkIn')} title={he.payments.whoWalkIn} subtitle={he.payments.whoWalkInSub} />
          </div>

          {who === 'existing' && (
            <div className="flex flex-col gap-2 border-t border-hair pt-3">
              <SearchInput
                placeholder={he.payments.searchPlaceholder}
                value={custQuery}
                onChange={(e) => setCustQuery(e.target.value)}
                aria-label={he.payments.searchCustomer}
              />
              {customers.isLoading ? (
                <Loading />
              ) : (
                <div className="flex flex-col overflow-hidden rounded-field border border-line">
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCustomer(c)}
                      aria-pressed={customer?.id === c.id}
                      className={`flex min-h-12 items-center gap-3 border-b border-hair px-3 text-start last:border-0 ${
                        customer?.id === c.id ? 'bg-accent/8' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="block text-xs text-faint">
                          <bdi>{c.phone}</bdi> · {c.publicId}
                        </span>
                      </span>
                      {customer?.id === c.id && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-4 shrink-0 text-accent" aria-hidden="true">
                          <path d="M4 12.5l5 5L20 6.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <p className="px-3 py-4 text-center text-sm text-faint">{he.common.noResults}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {who === 'new' && (
            <div className="flex flex-col gap-3 border-t border-hair pt-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={he.payments.firstName}>
                  <Input required value={newC.firstName} onChange={(e) => setNewC({ ...newC, firstName: e.target.value })} />
                </Field>
                <Field label={he.payments.lastName}>
                  <Input value={newC.lastName} onChange={(e) => setNewC({ ...newC, lastName: e.target.value })} />
                </Field>
              </div>
              <Field label={he.payments.phone}>
                <Input required type="tel" inputMode="tel" dir="ltr" className="text-end" value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} />
              </Field>
              <Field label={`${he.payments.email} ${he.common.optional}`}>
                <Input type="email" inputMode="email" dir="ltr" className="text-end" value={newC.email} onChange={(e) => setNewC({ ...newC, email: e.target.value })} />
              </Field>
            </div>
          )}

          {who === 'walkIn' && (
            <div className="flex flex-col gap-3 border-t border-hair pt-3">
              <Field label={he.payments.walkInName} hint={he.payments.walkInHint}>
                <Input required value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`${he.payments.phone} ${he.common.optional}`}>
                  <Input type="tel" inputMode="tel" dir="ltr" className="text-end" value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} />
                </Field>
                <Field label={`${he.payments.email} ${he.common.optional}`}>
                  <Input type="email" inputMode="email" dir="ltr" className="text-end" value={walkIn.email} onChange={(e) => setWalkIn({ ...walkIn, email: e.target.value })} />
                </Field>
              </div>
            </div>
          )}

          <Button className="w-full" disabled={!step1Valid} onClick={() => setStep(2)}>
            {he.common.next}
          </Button>
        </div>
      )}

      {/* ── step 2 · cart (products × quantity) + promo ───────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold">{he.payments.productTitle}</p>
            {products.isLoading ? (
              <Loading />
            ) : (
              (products.data ?? []).map((p) => {
                const qty = cart[p.id] ?? 0
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-3 rounded-field border p-3 ${
                      qty > 0 ? 'border-accent bg-accent/5' : 'border-line'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.name}</p>
                      {p.description && <p className="truncate text-xs text-faint">{p.description}</p>}
                      <p className="mt-0.5 text-xs font-semibold text-muted tnum">
                        <bdi>{formatMoney(p.price, tenant.currency, tenant.locale)}</bdi>
                      </p>
                    </div>
                    {qty === 0 ? (
                      <Button variant="ghost" className="shrink-0 px-3" onClick={() => setQty(p.id, 1)}>
                        {he.payments.addToCart}
                      </Button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <StepBtn label={he.payments.qtyDecrease} onClick={() => setQty(p.id, qty - 1)}>−</StepBtn>
                        <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                        <StepBtn label={he.payments.qtyIncrease} onClick={() => setQty(p.id, qty + 1)}>+</StepBtn>
                      </div>
                    )}
                  </div>
                )
              })
            )}
            {cartLines.length === 0 ? (
              <p className="text-xs text-faint">{he.payments.productRequired}</p>
            ) : (
              <div className="mt-1 flex items-baseline justify-between border-t border-hair pt-2">
                <span className="text-sm font-bold">
                  {he.payments.cartTotal}
                  <span className="ms-2 text-xs font-normal text-faint">
                    {cartCount === 1 ? he.payments.cartCountOne : fmt(he.payments.cartCount, { n: cartCount })}
                  </span>
                </span>
                <span className="text-base font-bold tnum"><bdi>{formatMoney(cartTotal, tenant.currency, tenant.locale)}</bdi></span>
              </div>
            )}
          </div>

          <div className="border-t border-hair pt-3">
            <Field label={`${he.payments.promoCode} ${he.common.optional}`}>
              <div className="flex gap-2">
                <Input
                  placeholder={he.payments.promoPlaceholder}
                  value={promoTyped}
                  onChange={(e) => { setPromoTyped(e.target.value); setPromoState(null) }}
                  className="uppercase"
                  dir="ltr"
                />
                <Button variant="ghost" className="shrink-0" disabled={!promoTyped.trim() || cartLines.length === 0} onClick={applyPromo}>
                  {he.common.confirm}
                </Button>
              </div>
            </Field>
            {promoState && (
              <p className={`mt-2 text-xs font-semibold ${promoState.ok ? 'text-ok' : 'text-crit'}`}>
                {promoState.ok
                  ? `${fmt(he.payments.promoApplied, { name: promoState.promo.name })} · `
                  : promoState.reason}
                {promoState.ok && (
                  <bdi className="tnum">{formatMoney(promoState.discountedAmount, tenant.currency, tenant.locale)}</bdi>
                )}
              </p>
            )}
          </div>

          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={() => setStep(1)}>{he.common.back}</Button>
            <Button disabled={cartLines.length === 0} onClick={() => setStep(3)}>{he.common.next}</Button>
          </div>
        </div>
      )}

      {/* ── step 3 · method ───────────────────────────────────────────── */}
      {step === 3 && cartLines.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="py-2 text-center">
            <p className="text-3xl font-bold tracking-tight tnum">
              <bdi>{formatMoney(amount, tenant.currency, tenant.locale)}</bdi>
            </p>
            <p className="mt-1 text-xs text-faint">
              {cartSummary} · {payerName}
            </p>
          </div>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label={he.payments.methodTitle}>
            <p className="text-sm font-bold">{he.payments.methodTitle}</p>
            <OptionTile selected={method === 'card'} onSelect={() => setMethod('card')} title={he.payments.methodCard} subtitle={he.payments.methodCardSub} />
            <OptionTile selected={method === 'cash'} onSelect={() => setMethod('cash')} title={he.payments.methodCash} subtitle={he.payments.methodCashSub} />
            <OptionTile selected={method === 'other'} onSelect={() => setMethod('other')} title={he.payments.methodOther} subtitle={he.payments.methodOtherSub} />
          </div>

          {method === 'card' && (
            <div className="flex flex-col gap-2 border-t border-hair pt-3" role="radiogroup">
              <OptionTile selected={cardMode === 'charge'} onSelect={() => setCardMode('charge')} title={he.payments.cardCharge} />
              <OptionTile selected={cardMode === 'link'} onSelect={() => setCardMode('link')} title={he.payments.cardLink} />
              <p className="text-xs text-faint">{he.payments.cardSecurityNote}</p>
            </div>
          )}

          {method === 'other' && (
            <div className="border-t border-hair pt-3">
              <Field label={he.payments.otherLabel}>
                <Input required placeholder={he.payments.otherPlaceholder} value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} />
              </Field>
            </div>
          )}

          <div className="flex gap-3 [&>*]:flex-1">
            <Button variant="ghost" onClick={() => setStep(2)}>{he.common.back}</Button>
            <Button disabled={!step3Valid || busy} onClick={complete}>
              {busy ? he.common.loading : he.common.confirm}
            </Button>
          </div>
        </div>
      )}

      {/* ── step 4 · receipt ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-field border border-ok/30 bg-ok/5 p-4 text-center">
            <div aria-hidden="true" className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-ok/15 text-lg font-bold text-ok">✓</div>
            <p className="text-lg font-bold">{he.payments.paymentRecorded}</p>
            <p className="mt-0.5 text-sm text-muted">
              {watched?.invoiceId
                ? fmt(he.payments.invoiceNumber, { n: watched.invoiceId.replace(/^inv-/, '') })
                : '…'}
            </p>

            <dl className="mt-4 text-start text-sm">
              <ReceiptRow label={he.payments.customer} value={payerName} />
              <ReceiptRow label={he.payments.product} value={cartSummary} />
              <ReceiptRow
                label={he.payments.method}
                value={
                  method === 'cash' ? he.payments.methodCash
                    : method === 'card' ? he.payments.methodCard
                      : otherLabel
                }
              />
              <ReceiptRow
                label={he.payments.amount}
                value={formatMoney(amount, tenant.currency, tenant.locale)}
                tnum
              />
            </dl>

            {paymentLink && (
              <p className="mt-3 break-all rounded-field border border-dashed border-line bg-page/60 p-2 text-start text-xs text-muted" dir="ltr">
                {paymentLink}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" disabled={!contactEmail || sent === 'email'} onClick={() => send('email')}>
              {sent === 'email' ? '✓' : he.payments.sendEmail}
            </Button>
            <Button variant="ghost" disabled={!contactPhone || sent === 'whatsapp'} onClick={() => send('whatsapp')}>
              {sent === 'whatsapp' ? '✓' : he.payments.sendWhatsApp}
            </Button>
          </div>

          <Button className="w-full" onClick={reset}>{he.payments.newPayment}</Button>
        </div>
      )}
    </Card>
  )
}

function StepBtn({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full border border-line bg-surface text-base font-bold leading-none text-ink"
    >
      {children}
    </button>
  )
}

function ReceiptRow({ label, value, tnum = false }: { label: string; value: string; tnum?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair py-1.5 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-bold ${tnum ? 'tnum' : ''}`}><bdi>{value}</bdi></dd>
    </div>
  )
}
