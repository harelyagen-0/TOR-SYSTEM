/**
 * Formatting + timezone helpers.
 *
 * Storage is always UTC; rendering is always in the studio timezone from
 * tenant config (default Asia/Jerusalem). The week starts on SUNDAY.
 */
import { Timestamp } from 'firebase/firestore'
import { he } from '../locale/he'

export const DEFAULT_TZ = 'Asia/Jerusalem'

export function asDate(d: Date | Timestamp): Date {
  return d instanceof Timestamp ? d.toDate() : d
}

// ── money ───────────────────────────────────────────────────────────────────
/**
 * Formats an integer agorot amount as currency. Input is ALWAYS agorot (see
 * src/lib/money.ts); this is the single display boundary that divides by 100.
 * Whole-shekel amounts show no fraction; anything with agorot shows two.
 */
export function formatMoney(agorot: number, currency = 'ILS', locale = 'he-IL'): string {
  const shekels = agorot / 100
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(shekels)
}

// ── dates ───────────────────────────────────────────────────────────────────
/** "יום שני, 23 ביולי" — the header date. */
export function formatHeaderDate(d: Date, tz = DEFAULT_TZ, locale = 'he-IL'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(d)
}

export function formatShortDate(d: Date | Timestamp, tz = DEFAULT_TZ, locale = 'he-IL'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
    timeZone: tz,
  }).format(asDate(d))
}

export function formatTime(d: Date | Timestamp, tz = DEFAULT_TZ, locale = 'he-IL'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(asDate(d))
}

// ── timezone maths ──────────────────────────────────────────────────────────
/** Calendar parts of a UTC instant, seen from the studio timezone. */
export function tzParts(d: Date, tz = DEFAULT_TZ): {
  year: number; month: number; day: number; hour: number; minute: number; weekday: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekdayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: weekdayIdx, // 0 = Sunday
  }
}

/** 'YYYY-MM-DD' key of an instant in the studio timezone. */
export function dateKey(d: Date | Timestamp, tz = DEFAULT_TZ): string {
  const p = tzParts(asDate(d), tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** '2026-07' month key of an instant in the studio timezone. */
export function monthKey(d: Date | Timestamp, tz = DEFAULT_TZ): string {
  const p = tzParts(asDate(d), tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/**
 * UTC instant for a wall-clock time in the studio timezone.
 * Two-pass offset correction handles DST transitions correctly for every
 * normal wall time (the 60-minute spring-forward gap resolves to the hour after).
 */
export function zonedTimeToUtc(
  ymd: string, // 'YYYY-MM-DD'
  hm: string, // 'HH:mm'
  tz = DEFAULT_TZ,
): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // offset(t) = wall-clock-of(t) − t; solve t + offset(t) = wall in two passes
  const guess = wall - (utcFromParts(new Date(wall), tz) - wall)
  const offset = utcFromParts(new Date(guess), tz) - guess
  return new Date(wall - offset)
}

function utcFromParts(d: Date, tz: string): number {
  const p = tzParts(d, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}

/** Start of the SUNDAY-based week containing `d`, as a studio-tz date key. */
export function weekStartKey(d: Date, tz = DEFAULT_TZ): string {
  const p = tzParts(d, tz)
  // walk back `weekday` days in date-key space (avoids UTC-day drift)
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day))
  base.setUTCDate(base.getUTCDate() - p.weekday)
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`
}

/** Add n days to a 'YYYY-MM-DD' key (pure calendar arithmetic). */
export function addDaysKey(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + n)
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`
}

/** Hebrew weekday name for a 0=Sunday index. */
export function weekdayName(idx: number): string {
  return he.weekdays[idx] ?? ''
}

/** "23.7–29.7" style range label for a week starting at `startYmd`. */
export function weekRangeLabel(startYmd: string): string {
  const endYmd = addDaysKey(startYmd, 6)
  const fmt = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number)
    return `${d}.${m}`
  }
  return `${fmt(startYmd)}–${fmt(endYmd)}`
}
