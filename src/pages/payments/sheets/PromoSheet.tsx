import { useState, type FormEvent } from 'react'
import { Button, Field, Input, OptionTile, Pill, Select, Sheet } from '../../../components/ui'
import { fmt, he } from '../../../locale/he'
import { dateKey, formatMoney, formatShortDate } from '../../../lib/format'
import { useTenant } from '../../../tenant/TenantProvider'
import { useCreatePromo, usePromoCodes, useUpdatePromo } from '../../../data/promoCodes'
import { useProducts } from '../../../data/products'
import type { ProductKind, PromoCode } from '../../../types/models'

/** quick-select buckets — "only single entries", "only subscriptions", … */
const KIND_CHIPS: Array<{ kind: ProductKind; label: string }> = [
  { kind: 'single', label: he.products.kindSingle },
  { kind: 'punchCard', label: he.products.kindPunchCard },
  { kind: 'subscription', label: he.products.kindSubscription },
]

/** §8.2.3 — create, edit, or deactivate a discount code: code, name,
 *  description, valid-until, audience, discount value. */
export function PromoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const promos = usePromoCodes()
  // include inactive products: a code may still be restricted to one that was
  // retired, and hiding it here would silently drop it on the next save
  const products = useProducts(false)
  const create = useCreatePromo()
  const update = useUpdatePromo()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discountKind, setDiscountKind] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [audience, setAudience] = useState<'new' | 'existing' | 'all'>('all')
  const [usageLimit, setUsageLimit] = useState('')
  // null = the discount applies to every product (default); a list restricts it
  const [productIds, setProductIds] = useState<string[] | null>(null)
  const [productsOpen, setProductsOpen] = useState(false)

  const list = promos.data ?? []
  const productList = products.data ?? []
  const editingPromo = editingId ? list.find((p) => p.id === editingId) ?? null : null
  const busy = create.isPending || update.isPending

  const isProductOn = (id: string) => productIds === null || productIds.includes(id)
  /** a selection covering every product is stored as null ("all products") */
  const normalize = (next: string[]): string[] | null => {
    const all = productList.map((p) => p.id)
    return all.length > 0 && all.every((x) => next.includes(x)) ? null : next
  }
  function toggleProduct(id: string) {
    const base = productIds === null ? productList.map((p) => p.id) : [...productIds]
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    setProductIds(normalize(next))
  }
  /** quick-select: restrict the code to one product kind only */
  function selectKind(kind: ProductKind) {
    setProductIds(normalize(productList.filter((p) => p.kind === kind).map((p) => p.id)))
  }
  const selectedCount = productIds === null ? productList.length : productIds.length
  const kindIsExactly = (kind: ProductKind) => {
    if (productIds === null) return false
    const ofKind = productList.filter((p) => p.kind === kind).map((p) => p.id)
    return ofKind.length > 0 && ofKind.length === productIds.length && ofKind.every((x) => productIds.includes(x))
  }
  // an empty list would mean "valid on nothing" — block it rather than save a
  // code that can never be redeemed
  const productsInvalid = productIds !== null && productIds.length === 0

  function resetForm() {
    setEditingId(null)
    setCode(''); setName(''); setDescription(''); setDiscountKind('percent')
    setValue(''); setValidUntil(''); setAudience('all'); setUsageLimit('')
    setProductIds(null); setProductsOpen(false)
  }

  function startEdit(p: PromoCode) {
    setEditingId(p.id)
    setCode(p.code)
    setName(p.name)
    setDescription(p.description ?? '')
    setDiscountKind(p.discountKind)
    setValue(String(p.value))
    setValidUntil(p.validUntil ? dateKey(p.validUntil, tenant.timezone) : '')
    setAudience(p.audience)
    setUsageLimit(p.usageLimit != null ? String(p.usageLimit) : '')
    setProductIds(p.productIds ?? null)
    setProductsOpen(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (productsInvalid) {
      setProductsOpen(true)
      return
    }
    const payload = {
      code,
      name,
      description,
      discountKind,
      value: Number(value),
      validUntil: validUntil ? new Date(`${validUntil}T23:59:00`) : undefined,
      audience,
      usageLimit: usageLimit ? Number(usageLimit) : undefined,
      productIds,
    }
    if (editingId) await update.mutateAsync({ id: editingId, ...payload })
    else await create.mutateAsync(payload)
    resetForm()
  }

  async function toggleActive() {
    if (!editingPromo) return
    await update.mutateAsync({ id: editingPromo.id, active: !editingPromo.active })
    resetForm()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.promo.title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {editingId && (
          <div className="flex items-center justify-between rounded-field bg-accent/5 px-3 py-2 text-sm font-bold text-accent">
            <span>{he.promo.editTitle} · <bdi dir="ltr">{code}</bdi></span>
            <button type="button" className="text-xs font-bold" onClick={resetForm}>
              {he.promo.cancelEdit}
            </button>
          </div>
        )}
        <Field label={he.promo.code}>
          <Input required dir="ltr" className="uppercase" placeholder="SUMMER10" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label={he.promo.name}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={`${he.promo.description} ${he.common.optional}`}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={he.promo.discountKind}>
          <p className="text-sm font-bold">{he.promo.discountKind}</p>
          <div className="grid grid-cols-2 gap-2">
            <OptionTile selected={discountKind === 'percent'} onSelect={() => setDiscountKind('percent')} title={he.promo.percent} />
            <OptionTile selected={discountKind === 'fixed'} onSelect={() => setDiscountKind('fixed')} title={he.promo.fixed} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={he.promo.value}>
            <Input required type="number" inputMode="decimal" min="0" dir="ltr" className="text-end tnum" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label={`${he.promo.usageLimit} ${he.common.optional}`}>
            <Input type="number" inputMode="numeric" min="1" dir="ltr" className="text-end tnum" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`${he.promo.validUntil} ${he.common.optional}`}>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
          <Field label={he.promo.audience}>
            <Select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
              <option value="all">{he.promo.audienceAll}</option>
              <option value="new">{he.promo.audienceNew}</option>
              <option value="existing">{he.promo.audienceExisting}</option>
            </Select>
          </Field>
        </div>

        {/* which products the discount applies to — default: all */}
        <div>
          <button
            type="button"
            aria-expanded={productsOpen}
            onClick={() => setProductsOpen((v) => !v)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-field border border-line bg-surface px-3.5 text-start"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold">{he.promo.products}</span>
              <span className={`truncate text-xs ${productsInvalid ? 'text-crit' : 'text-faint'}`}>
                {productList.length === 0
                  ? he.promo.productsNone
                  : productsInvalid
                    ? he.promo.productsEmpty
                    : productIds === null
                      ? he.promo.productsAll
                      : fmt(he.promo.productsSome, { n: selectedCount, total: productList.length })}
              </span>
            </span>
            <span aria-hidden="true" className={`shrink-0 text-faint transition-transform ${productsOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {productsOpen && productList.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 rounded-field border border-line bg-page/60 p-2">
              {/* quick-select — e.g. "only single entries", "only subscriptions" */}
              <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-1">
                <span className="text-xs text-faint">{he.promo.productsQuick}</span>
                <button
                  type="button"
                  aria-pressed={productIds === null}
                  onClick={() => setProductIds(null)}
                  className={`rounded-md border px-2 py-1 text-xs font-bold ${
                    productIds === null ? 'border-accent/25 bg-accent/10 text-accent' : 'border-line text-muted'
                  }`}
                >
                  {he.promo.productsAll}
                </button>
                {KIND_CHIPS.filter(({ kind }) => productList.some((p) => p.kind === kind)).map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={kindIsExactly(kind)}
                    onClick={() => selectKind(kind)}
                    className={`rounded-md border px-2 py-1 text-xs font-bold ${
                      kindIsExactly(kind) ? 'border-accent/25 bg-accent/10 text-accent' : 'border-line text-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {productList.map((p) => (
                <label key={p.id} className="flex min-h-10 items-center gap-3 rounded-md px-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--t-accent)]"
                    checked={isProductOn(p.id)}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {p.name}
                    {!p.active && <span className="ms-1.5 text-xs font-normal text-faint">({he.promo.productsInactive})</span>}
                  </span>
                  <span className="shrink-0 text-xs text-faint tnum">
                    <bdi>{formatMoney(p.price, tenant.currency, tenant.locale)}</bdi>
                  </span>
                </label>
              ))}
              <p className={`px-1.5 pt-1 text-xs ${productsInvalid ? 'font-semibold text-crit' : 'text-faint'}`}>
                {productsInvalid ? he.promo.productsEmpty : he.promo.productsHint}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={busy || productsInvalid}>
            {editingId ? he.promo.saveChanges : he.common.save}
          </Button>
          {editingPromo && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className={editingPromo.active ? 'text-crit' : 'text-accent'}
              onClick={toggleActive}
            >
              {editingPromo.active ? he.promo.deactivate : he.promo.reactivate}
            </Button>
          )}
        </div>
      </form>

      <section>
        <div className="mb-2 flex items-baseline justify-between border-b border-hair pb-1.5">
          <h3 className="text-sm font-bold text-muted">{he.promo.listTitle}</h3>
          {list.length > 0 && <span className="text-xs text-faint">{he.promo.editHint}</span>}
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-faint">{he.promo.empty}</p>
        ) : (
          <div className="flex flex-col">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => startEdit(p)}
                className={`flex w-full items-center justify-between gap-3 rounded-md border-b border-hair px-1 py-2.5 text-start text-sm last:border-0 ${
                  editingId === p.id ? 'bg-accent/5' : ''
                } ${p.active ? '' : 'opacity-60'}`}
              >
                <div className="min-w-0">
                  <p className="font-bold"><bdi dir="ltr">{p.code}</bdi> · {p.name}</p>
                  <p className="text-xs text-faint">
                    {p.discountKind === 'percent' ? `${p.value}%` : `₪${p.value}`}
                    {p.validUntil && ` · ${he.promo.validUntil} ${formatShortDate(p.validUntil, tenant.timezone, tenant.locale)}`}
                    {p.usageLimit != null && ` · ${fmt(he.promo.used, { used: p.usedCount, limit: p.usageLimit })}`}
                    {p.productIds != null &&
                      ` · ${fmt(he.promo.productsSome, { n: p.productIds.length, total: productList.length })}`}
                  </p>
                </div>
                <Pill tone={p.active ? 'ok' : 'muted'}>{p.active ? he.common.active : he.common.inactive}</Pill>
              </button>
            ))}
          </div>
        )}
      </section>
    </Sheet>
  )
}
