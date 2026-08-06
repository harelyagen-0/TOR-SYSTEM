import { useState, type FormEvent } from 'react'
import { Button, EmptyState, Field, Input, Loading, OptionTile, Sheet } from '../../../components/ui'
import { he } from '../../../locale/he'
import { dateKey, formatMoney, formatShortDate } from '../../../lib/format'
import { toAgorot } from '../../../lib/money'
import { useTenant } from '../../../tenant/TenantProvider'
import { useCreateExpense, useExpenses } from '../../../data/expenses'
import type { Expense, PaymentMethod } from '../../../types/models'

/** Human label for an expense's optional payment method. */
function methodLabelOf(e: Expense): string {
  if (e.paymentMethod === 'card') return he.expenses.methodCard
  if (e.paymentMethod === 'cash') return he.expenses.methodCash
  if (e.paymentMethod === 'other') return e.paymentMethodLabel?.trim() || he.expenses.methodOther
  return ''
}

/** §8.2.4 — expense list + add form with an uploaded photo/PDF receipt.
 *  Every expense feeds the accountant ledger (Cloud Function). */
export function ExpensesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant()
  const expenses = useExpenses()
  const create = useCreateExpense()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => dateKey(new Date()))
  const [file, setFile] = useState<File | null>(null)
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [methodLabel, setMethodLabel] = useState('')

  // an optional field — clicking the selected tile again clears the choice
  const pickMethod = (m: PaymentMethod) => setMethod((prev) => (prev === m ? null : m))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await create.mutateAsync({
      name,
      description,
      amount: toAgorot(amount),
      date: new Date(`${date}T12:00:00`),
      paymentMethod: method ?? undefined,
      paymentMethodLabel: method === 'other' ? methodLabel : undefined,
      attachment: file ?? undefined,
    })
    setName(''); setDescription(''); setAmount(''); setFile(null)
    setMethod(null); setMethodLabel('')
  }

  return (
    <Sheet open={open} onClose={onClose} title={he.expenses.title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={he.expenses.name}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={`${he.expenses.description} ${he.common.optional}`}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={he.expenses.amount}>
            <Input required type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" className="text-end tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={he.expenses.date}>
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={he.expenses.methodTitle}>
          <span className="text-sm font-semibold">
            {he.expenses.methodTitle} <span className="font-normal text-faint">{he.common.optional}</span>
          </span>
          <OptionTile selected={method === 'card'} onSelect={() => pickMethod('card')} title={he.expenses.methodCard} subtitle={he.expenses.methodCardSub} />
          <OptionTile selected={method === 'cash'} onSelect={() => pickMethod('cash')} title={he.expenses.methodCash} subtitle={he.expenses.methodCashSub} />
          <OptionTile selected={method === 'other'} onSelect={() => pickMethod('other')} title={he.expenses.methodOther} subtitle={he.expenses.methodOtherSub} />
          {method === 'other' && (
            <Field label={`${he.expenses.methodDetail} ${he.common.optional}`}>
              <Input placeholder={he.expenses.methodDetailPlaceholder} value={methodLabel} onChange={(e) => setMethodLabel(e.target.value)} />
            </Field>
          )}
        </div>

        <label className="relative flex flex-col items-center gap-1 rounded-field border-[1.5px] border-dashed border-line bg-page/60 px-4 py-6 text-center">
          <input
            type="file"
            accept="image/*,application/pdf"
            aria-label={he.expenses.receipt}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span aria-hidden="true" className="text-xl opacity-70">📷</span>
          <span className="text-sm font-bold">{file ? file.name : he.expenses.receipt}</span>
          <span className="text-xs text-faint">{he.expenses.receiptHint}</span>
        </label>

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? he.common.loading : he.common.save}
        </Button>
      </form>

      <section>
        <h3 className="mb-2 border-b border-hair pb-1.5 text-sm font-bold text-muted">{he.expenses.title}</h3>
        {expenses.isLoading ? (
          <Loading />
        ) : (expenses.data ?? []).length === 0 ? (
          <EmptyState title={he.expenses.empty} />
        ) : (
          <div className="flex flex-col">
            {(expenses.data ?? []).slice(0, 12).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-hair py-2.5 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-bold">{e.name}</p>
                  <p className="text-xs text-faint">
                    {formatShortDate(e.date, tenant.timezone, tenant.locale)}
                    {e.category && ` · ${e.category}`}
                    {methodLabelOf(e) && ` · ${methodLabelOf(e)}`}
                    {e.attachmentUrl && ' · 📎'}
                  </p>
                </div>
                <p className="shrink-0 font-bold tnum text-crit">
                  <bdi>{formatMoney(-e.amount, tenant.currency, tenant.locale)}</bdi>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </Sheet>
  )
}
