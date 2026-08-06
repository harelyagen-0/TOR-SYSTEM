import { useState, type FormEvent } from 'react'
import { Button, Field, Input, OptionTile, Sheet } from '../../../components/ui'
import { he } from '../../../locale/he'
import { formatMoney } from '../../../lib/format'
import { useCreateProduct, useProducts, useUpdateProduct } from '../../../data/products'
import { useTenant } from '../../../tenant/TenantProvider'
import { toAgorot } from '../../../lib/money'
import type { ProductKind } from '../../../types/models'

/** §8.2.1 — name, description, price, kind (single / punch card of N /
 *  subscription every N days). Existing products can be archived / restored
 *  (never hard-deleted — payments snapshot them). */
export function ProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const create = useCreateProduct()
  const allProducts = useProducts(false)
  const updateProduct = useUpdateProduct()
  const [kind, setKind] = useState<ProductKind>('single')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [punchCount, setPunchCount] = useState('10')
  const [intervalDays, setIntervalDays] = useState('30')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({
      name,
      description,
      price: toAgorot(price),
      kind,
      punchCount: Number(punchCount) || 10,
      intervalDays: Number(intervalDays) || 30,
    })
    setName(''); setDescription(''); setPrice('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.products.title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

        <div className="flex gap-3 [&>*]:flex-1">
          <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
          <Button type="submit" disabled={create.isPending}>{he.common.save}</Button>
        </div>
      </form>

      {/* existing products — archive / restore */}
      {(allProducts.data ?? []).length > 0 && (
        <section className="mt-2">
          <h3 className="mb-2 border-b border-hair pb-1.5 text-sm font-bold text-muted">{he.products.existing}</h3>
          <div className="flex flex-col">
            {(allProducts.data ?? []).map((p) => (
              <div key={p.id} className={`flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm last:border-0 ${p.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-faint tnum"><bdi>{formatMoney(p.price, tenant.currency, tenant.locale)}</bdi></p>
                </div>
                <Button
                  variant="ghost"
                  className={`!min-h-9 px-3 ${p.active ? 'text-crit' : 'text-accent'}`}
                  disabled={updateProduct.isPending}
                  onClick={() => updateProduct.mutate({ id: p.id, active: !p.active })}
                >
                  {p.active ? he.products.archive : he.products.restore}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </Sheet>
  )
}
