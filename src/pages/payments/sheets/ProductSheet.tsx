import { useState, type FormEvent } from 'react'
import { Button, Field, Input, OptionTile, Sheet } from '../../../components/ui'
import { he } from '../../../locale/he'
import { useCreateProduct } from '../../../data/products'
import { useTenant } from '../../../tenant/TenantProvider'
import type { ProductKind } from '../../../types/models'

/** §8.2.1 — name, description, price, kind (single / punch card of N /
 *  subscription every N days). */
export function ProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProduct()
  const tenant = useTenant()
  const [kind, setKind] = useState<ProductKind>('single')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [punchCount, setPunchCount] = useState('10')
  const [intervalDays, setIntervalDays] = useState('30')
  const [allowedTypes, setAllowedTypes] = useState<string[]>([])

  function toggleType(id: string) {
    setAllowedTypes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({
      name,
      description,
      price: Number(price),
      kind,
      punchCount: Number(punchCount) || 10,
      intervalDays: Number(intervalDays) || 30,
      allowedClassTypes: allowedTypes,
    })
    setName(''); setDescription(''); setPrice(''); setAllowedTypes([])
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

        <div className="flex gap-3 [&>*]:flex-1">
          <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
          <Button type="submit" disabled={create.isPending}>{he.common.save}</Button>
        </div>
      </form>
    </Sheet>
  )
}
