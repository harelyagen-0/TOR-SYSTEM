import { describe, expect, it } from 'vitest'
import { sumLedger } from '../src/data/reports'
import type { LedgerLine } from '../src/types/models'

const line = (kind: LedgerLine['kind'], amount: number): LedgerLine =>
  ({ id: Math.random().toString(), kind, amount, description: '', refId: '', period: '2026-07' } as LedgerLine)

describe('sumLedger', () => {
  it('nets income, refunds (negative) and expenses (negative)', () => {
    const totals = sumLedger([
      line('payment', 30000),
      line('payment', 5000),
      line('refund', -9000),
      line('expense', -12000),
    ])
    expect(totals.income).toBe(35000)
    expect(totals.refunds).toBe(-9000)
    expect(totals.expenses).toBe(12000) // stored negative, reported positive
    expect(totals.net).toBe(35000 - 9000 - 12000)
  })
  it('is zero for an empty ledger', () => {
    expect(sumLedger([])).toEqual({ income: 0, expenses: 0, refunds: 0, net: 0 })
  })
})
