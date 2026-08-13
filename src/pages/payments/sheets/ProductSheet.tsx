import { useState, type FormEvent } from 'react'
import { Button, Field, Input, OptionTile, Sheet } from '../../../components/ui'
import { fmt, he } from '../../../locale/he'
import { useCreateProduct } from '../../../data/products'
import { useTenant } from '../../../tenant/TenantProvider'
import type { ProductKind } from '../../../types/models'

/** §8.2.1 — name, description, price, kind (single / punch card of N /
 *  subscription every N days), and which class types the product grants entry
 *  to (the product-side mirror of a class's allowedProductIds). */
export function ProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const create = useCreateProduct()
  const [kind, setKind] = useState<ProductKind>('single')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [punchCount, setPunchCount] = useState('10')
  const [intervalDays, setIntervalDays] = useState('30')
  // null = product covers every class type (default); a list restricts entry
  const [allowedIds, setAllowedIds] = useState<string[] | null>(null)
  const [classesOpen, setClassesOpen] = useState(false)

  const classTypes = tenant.classTypes
  const isAllowed = (id: string) => allowedIds === null || allowedIds.includes(id)
  function toggleAllowed(id: string) {
    const all = classTypes.map((c) => c.id)
    let next = allowedIds === null ? [...all] : [...allowedIds]
    next = next.includes(id) ? next.filter((x) => x !== id) : [...next, id]
    // collapse back to "all" (null) when nothing is excluded
    setAllowedIds(next.length === all.length && all.every((x) => next.includes(x)) ? null : next)
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
      allowedClassTypeIds: allowedIds,
    })
    setName(''); setDescription(''); setPrice(''); setAllowedIds(null); setClassesOpen(false)
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

        {/* which class types this product grants entry to — default: all */}
        <div>
          <button
            type="button"
            aria-expanded={classesOpen}
            onClick={() => setClassesOpen((v) => !v)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-field border border-line bg-surface px-3.5 text-start"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold">{he.products.allowedClassTypes}</span>
              <span className="truncate text-xs text-faint">
                {classTypes.length === 0
                  ? he.products.allowedClassTypesNone
                  : allowedIds === null
                    ? he.products.allowedClassTypesAll
                    : fmt(he.products.allowedClassTypesSome, { n: allowedIds.length, total: classTypes.length })}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`shrink-0 text-faint transition-transform ${classesOpen ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </button>

          {classesOpen && classTypes.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 rounded-field border border-line bg-page/60 p-2">
              {classTypes.map((c) => (
                <label key={c.id} className="flex min-h-10 items-center gap-3 rounded-md px-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--t-accent)]"
                    checked={isAllowed(c.id)}
                    onChange={() => toggleAllowed(c.id)}
                  />
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.labelHe}</span>
                </label>
              ))}
              <p className="px-1.5 pt-1 text-xs text-faint">{he.products.allowedClassTypesHint}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 [&>*]:flex-1">
          <Button variant="ghost" onClick={onClose}>{he.common.cancel}</Button>
          <Button type="submit" disabled={create.isPending}>{he.common.save}</Button>
        </div>
      </form>
    </Sheet>
  )
}
