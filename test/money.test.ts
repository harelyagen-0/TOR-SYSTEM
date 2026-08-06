import { describe, expect, it } from 'vitest'
import { fromAgorot, splitVatInclusive, sumAgorot, toAgorot } from '../src/lib/money'

describe('agorot conversion', () => {
  it('shekels → integer agorot', () => {
    expect(toAgorot(50)).toBe(5000)
    expect(toAgorot('49.90')).toBe(4990)
    expect(toAgorot(0)).toBe(0)
    expect(toAgorot('abc')).toBe(0)
  })
  it('rounds to the nearest agora (no float drift)', () => {
    expect(toAgorot(0.1 + 0.2)).toBe(30) // 0.30000000000000004 → 30
  })
  it('agorot → shekels', () => {
    expect(fromAgorot(5000)).toBe(50)
    expect(fromAgorot(4990)).toBe(49.9)
  })
  it('sums stay integer', () => {
    expect(sumAgorot([5000, 4990, 40])).toBe(10030)
  })
})

describe('VAT split (18% inclusive)', () => {
  const vat = 0.18
  it('splits a gross into net + vat that sum back exactly', () => {
    const { netAgorot, vatAgorot, grossAgorot } = splitVatInclusive(11800, vat)
    expect(grossAgorot).toBe(11800)
    expect(netAgorot).toBe(10000)
    expect(vatAgorot).toBe(1800)
    expect(netAgorot + vatAgorot).toBe(grossAgorot)
  })
  it('handles rounding so net+vat always equals gross', () => {
    for (const g of [4990, 5000, 30000, 12345, 1]) {
      const s = splitVatInclusive(g, vat)
      expect(s.netAgorot + s.vatAgorot).toBe(g)
    }
  })
  it('rate 0 (עוסק פטור) puts everything in net', () => {
    const s = splitVatInclusive(5000, 0)
    expect(s.netAgorot).toBe(5000)
    expect(s.vatAgorot).toBe(0)
  })
})
