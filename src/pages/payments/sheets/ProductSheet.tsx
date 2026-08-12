import { useState, type FormEvent } from 'react'
import { Button, Field, Input, OptionTile, Pill, Sheet } from '../../../components/ui'
import { he } from '../../../locale/he'
import { formatMoney } from '../../../lib/format'
import { useCreateProduct, useProducts, useUpdateProduct } from '../../../data/products'
import { useTenant } from '../../../tenant/TenantProvider'
import type { Product, ProductKind } from '../../../types/models'

const KIND_LABEL: Record<ProductKind, string> = {
  single: he.products.kindSingle,
  punchCard: he.products.kindPunchCard,
  subscription: he.products.kindSubscription,
}

/** §8.2.1 — create a product, and edit / deactivate existing ones. A product is
 *  name, description, price, kind (single / punch card of N / subscription every
 *  N days) + the class types it grants entry to. */
export function ProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const products = useProducts(false) // include inactive so they can be re-enabled
  const create = useCreateProduct()
  const update = useUpdateProduct()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [kind, setKind] = useState<ProductKind>('single')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [punchCount, setPunchCount] = useState('10')
  const [intervalDays, setIntervalDays] = useState('30')
  const [allowedTypes, setAllowedTypes] = useState<string[]>([])

  const list = products.data ?? []
  const editingProduct = editingId ? list.find((p) => p.id === editingId) ?? null : null
  const busy = create.isPending || update.isPending

  function toggleType(id: string) {
    setAllowedTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function resetForm() {
    setEditingId(null)
    setKind('single'); setName(''); setDescription(''); setPrice('')
    setPunchCount('10'); setIntervalDays('30'); setAllowedTypes([])
  }

  function startEdit(p: Product) {
    setEditingId(p.id)
    setKind(p.kind)
    setName(p.name)
    setDescription(p.description ?? '')
    setPrice(String(p.price))
    setPunchCount(String(p.punchCount ?? 10))
    setIntervalDays(String(p.intervalDays ?? 30))
    setAllowedTypes(p.allowedClassTypes ?? [])
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const payload = {
      name,
      description,
      price: Number(price),
      kind,
      punchCount: Number(punchCount) || 10,
      intervalDays: Number(intervalDays) || 30,
      allowedClassTypes: allowedTypes,
    }
    if (editingId) await update.mutateAsync({ id: editingId, ...payload })
    else await create.mutateAsync(payload)
    resetForm()
  }

  async function toggleActive() {
    if (!editingProduct) return
    await update.mutateAsync({ id: editingProduct.id, active: !editingProduct.active })
    resetForm()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.products.title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {editingId && (
          <div className="flex items-center justify-between rounded-field bg-accent/5 px-3 py-2 text-sm font-bold text-accent">
            <span className="min-w-0 truncate">{he.products.editTitle} · {name}</span>
            <button type="button" className="shrink-0 text-xs font-bold" onClick={resetForm}>
              {he.products.cancelEdit}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={he.products.kind}>
          <p className="text-sm font-bold">{he.products.kind}</p>
          <OptionTile selected={kind === 'single'} onSelect={() => setKind('single')} title={he.products.kindSingle} subtitle={he.products.kindSingleSub} />
          <OptionTile selected={kind === 'punchCard'} onSelect={() => setKind('punchCard')} title={he.products.kindPunchCard} subtitle={he.products.kindPunchCardSub} />
          <OptionTile selected={kind === 'subscription'} onSelect={() => setKind('subscription')} title={he.products.kindSubscription} subtitle={he.products.kindSubscriptionSub} />
        </div>

        <Field label={he.products.name}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={`${he.products.description} ${he.common.optional}`}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={he.products.price}>
          <Input required type="number" inputMode="decimal" min="0" step="1" dir="ltr" className="text-end tnum" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        {kind === 'punchCard' && (
          <Field label={he.products.punchCount}>
            <Input required type="number" inputMode="numeric" min="1" dir="ltr" className="text-end tnum" value={punchCount} onChange={(e) => setPunchCount(e.target.value)} />
          </Field>
        )}
        {kind === 'subscription' && (
          <Field label={he.products.intervalDays}>
            <Input required type="number" inputMode="numeric" min="1" dir="ltr" className="text-end tnum" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
          </Field>
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{he.products.allowedTypes}</legend>
          <p className="mb-2 text-xs text-faint">{he.products.allowedTypesHint}</p>
          <div className="flex flex-col gap-1.5">
            {tenant.classTypes.map((c) => (
              <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-field border border-line px-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--t-accent)]"
                  checked={allowedTypes.includes(c.id)}
                  onChange={() => toggleType(c.id)}
                />
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: c.color }} />
                  {c.labelHe}
                </span>
              </label>
            ))}
          </div>
          {allowedTypes.length === 0 && (
            <p className="mt-2 text-xs font-semibold text-faint">{he.products.allowedTypesAll}</p>
          )}
        </fieldset>

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={busy}>
            {editingId ? he.products.saveChanges : he.common.save}
          </Button>
          {editingProduct && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              className={editingProduct.active ? 'text-crit' : 'text-accent'}
              onClick={toggleActive}
            >
              {editingProduct.active ? he.products.deactivate : he.products.reactivate}
            </Button>
          )}
        </div>
      </form>

      <section>
        <div className="mb-2 flex items-baseline justify-between border-b border-hair pb-1.5">
          <h3 className="text-sm font-bold text-muted">{he.products.listTitle}</h3>
          {list.length > 0 && <span className="text-xs text-faint">{he.products.editHint}</span>}
        </div>
        {products.isLoading ? (
          <p className="text-sm text-faint">{he.common.loading}</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-faint">{he.products.empty}</p>
        ) : (
          <div className="flex flex-col">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => startEdit(p)}
                className={`flex w-full items-center justify-between gap-3 border-b border-hair px-1 py-2.5 text-start text-sm last:border-0 ${
                  editingId === p.id ? 'bg-accent/5' : ''
                } ${p.active ? '' : 'opacity-60'}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-xs text-faint">
                    {KIND_LABEL[p.kind]}
                    {p.kind === 'punchCard' && p.punchCount != null && ` · ${p.punchCount}`}
                    {' · '}
                    <bdi className="tnum">{formatMoney(p.price, tenant.currency, tenant.locale)}</bdi>
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
