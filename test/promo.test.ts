import { describe, expect, it } from 'vitest'
import { validatePromo } from '../src/data/promoCodes'
import type { PromoCode } from '../src/types/models'

// prices are AGOROT; a fixed discount `value` is agorot, a percent is a number
function code(over: Partial<PromoCode>): PromoCode {
  return {
    id: 'p1', code: 'SAVE', name: 'save', discountKind: 'percent', value: 10,
    audience: 'all', usedCount: 0, active: true, productIds: null, ...over,
  } as PromoCode
}
const line = (productId: string, price: number, quantity = 1) => ({ productId, price, quantity })

describe('validatePromo', () => {
  it('applies a percentage to the whole cart', () => {
    const r = validatePromo([code({ discountKind: 'percent', value: 10 })], 'SAVE', 'all', [line('a', 10000)])
    expect(r.ok && r.discountedAmount).toBe(9000)
  })
  it('applies a fixed (agorot) discount, floored at zero', () => {
    const r = validatePromo([code({ discountKind: 'fixed', value: 2000 })], 'SAVE', 'existing', [line('a', 5000)])
    expect(r.ok && r.discountedAmount).toBe(3000)
  })
  it('rejects an unknown or inactive code', () => {
    expect(validatePromo([code({ active: false })], 'SAVE', 'all', [line('a', 5000)]).ok).toBe(false)
    expect(validatePromo([], 'NOPE', 'all', [line('a', 5000)]).ok).toBe(false)
  })
  it('enforces audience (new-only code rejects an existing customer)', () => {
    const r = validatePromo([code({ audience: 'new' })], 'SAVE', 'existing', [line('a', 5000)])
    expect(r.ok).toBe(false)
  })
  it('enforces the usage limit', () => {
    const r = validatePromo([code({ usageLimit: 5, usedCount: 5 })], 'SAVE', 'all', [line('a', 5000)])
    expect(r.ok).toBe(false)
  })
  it('a product-restricted code only discounts eligible lines', () => {
    const codes = [code({ discountKind: 'percent', value: 50, productIds: ['a'] })]
    // cart: a=10000 (eligible), b=10000 (not) → 50% off only a = 5000 discount
    const r = validatePromo(codes, 'SAVE', 'all', [line('a', 10000), line('b', 10000)])
    expect(r.ok && r.discountedAmount).toBe(15000)
  })
  it('rejects a restricted code when no line is eligible', () => {
    const codes = [code({ productIds: ['x'] })]
    expect(validatePromo(codes, 'SAVE', 'all', [line('a', 10000)]).ok).toBe(false)
  })
})
