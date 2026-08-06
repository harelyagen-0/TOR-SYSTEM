/**
 * Money is stored EVERYWHERE as an integer number of agorot (₪1 = 100 agorot).
 * This is the single rule that keeps prices exact: no floating-point shekels,
 * no rounding drift across a multi-line cart, no ambiguity in the ledger.
 *
 * The stored document fields are still named `price` / `amount` (renaming ~90
 * sites blind was riskier than documenting the unit), but their VALUE is agorot
 * — an integer. Conversion happens in exactly two places:
 *   • display  → formatMoney(agorot) divides by 100
 *   • entry    → a form reads/writes shekels and calls toAgorot/fromAgorot
 * Never do shekel arithmetic anywhere else.
 */

/** Documentation alias — a plain integer count of agorot. */
export type Agorot = number

/** Shekels (possibly fractional, from a text input) → integer agorot. */
export function toAgorot(shekels: number | string): Agorot {
  const n = typeof shekels === 'string' ? Number(shekels) : shekels
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Integer agorot → shekels (a Number, for display or an input's value). */
export function fromAgorot(agorot: Agorot): number {
  return agorot / 100
}

/** Sum a list of agorot amounts (kept integer). */
export function sumAgorot(values: Agorot[]): Agorot {
  return values.reduce((s, v) => s + Math.round(v), 0)
}

/** VAT breakdown of a gross (VAT-inclusive) agorot amount. */
export interface VatSplit {
  netAgorot: Agorot
  vatAgorot: Agorot
  grossAgorot: Agorot
  vatRate: number // e.g. 0.18
}

/**
 * Splits a VAT-INCLUSIVE gross amount into net + VAT. Prices in the catalogue
 * already include VAT (the tenant's chosen model), so this is the canonical
 * split shown on invoices and in the accountant report. When the studio is not
 * VAT-registered (עוסק פטור), pass rate 0 and the whole amount is net.
 */
export function splitVatInclusive(grossAgorot: Agorot, vatRate: number): VatSplit {
  const gross = Math.round(grossAgorot)
  if (vatRate <= 0) return { netAgorot: gross, vatAgorot: 0, grossAgorot: gross, vatRate: 0 }
  const net = Math.round(gross / (1 + vatRate))
  return { netAgorot: net, vatAgorot: gross - net, grossAgorot: gross, vatRate }
}
