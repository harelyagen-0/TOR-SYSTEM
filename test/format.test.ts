import { describe, expect, it } from 'vitest'
import { addDaysKey, dateKey, weekStartKey, zonedTimeToUtc } from '../src/lib/format'

const TZ = 'Asia/Jerusalem'

describe('zonedTimeToUtc (the +3h bug guard)', () => {
  it('winter (IST, UTC+2): 08:00 wall → 06:00Z', () => {
    // 2026-01-15 is standard time in Israel (UTC+2)
    expect(zonedTimeToUtc('2026-01-15', '08:00', TZ).toISOString()).toBe('2026-01-15T06:00:00.000Z')
  })
  it('summer (IDT, UTC+3): 08:00 wall → 05:00Z', () => {
    // 2026-07-15 is daylight time in Israel (UTC+3)
    expect(zonedTimeToUtc('2026-07-15', '08:00', TZ).toISOString()).toBe('2026-07-15T05:00:00.000Z')
  })
  it('round-trips back to the same wall-clock date key', () => {
    const utc = zonedTimeToUtc('2026-07-15', '23:30', TZ)
    expect(dateKey(utc, TZ)).toBe('2026-07-15')
  })
})

describe('date-key arithmetic', () => {
  it('addDaysKey crosses month boundaries', () => {
    expect(addDaysKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('weekStartKey returns the Sunday of the week', () => {
    // 2026-07-15 is a Wednesday → week starts Sunday 2026-07-12
    expect(weekStartKey(zonedTimeToUtc('2026-07-15', '12:00', TZ), TZ)).toBe('2026-07-12')
  })
})
