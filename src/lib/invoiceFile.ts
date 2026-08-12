/**
 * Builds a downloadable invoice document for a ledger line and triggers its
 * download. The invoicing provider is [OPEN] (real tax-invoice PDFs aren't
 * generated yet), so this produces an honest, self-contained HTML copy from the
 * studio's own records — clearly labelled as auto-generated, not an official
 * tax invoice.
 */
import { he } from '../locale/he'
import { formatMoney, formatShortDate } from './format'
import type { LedgerLine, TenantConfig } from '../types/models'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

export function invoiceNumberOf(line: LedgerLine): string {
  return (line.invoiceId ?? '').replace(/^inv-/, '')
}

/** True for a credit/refund invoice (number carries a trailing C, or a refund line). */
function isCredit(line: LedgerLine): boolean {
  return line.kind === 'refund' || /C$/i.test(invoiceNumberOf(line))
}

export function buildInvoiceHtml(line: LedgerLine, tenant: TenantConfig): string {
  const number = invoiceNumberOf(line)
  const title = isCredit(line) ? he.invoice.creditTitle : he.invoice.title
  const date = formatShortDate(line.createdAt, tenant.timezone, tenant.locale)
  const amount = formatMoney(line.amount, tenant.currency, tenant.locale)
  const contact = tenant.contact ?? {}
  const contactLine = [contact.phone, contact.email, contact.address].filter(Boolean).join(' · ')

  return `<!doctype html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} ${escapeHtml(number)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 2.5rem 1.5rem; font-family: "Heebo","Assistant","Noto Sans Hebrew",system-ui,sans-serif; color: #0b0f1a; background: #f6f7f9; }
  .sheet { max-width: 40rem; margin: 0 auto; background: #fff; border: 1px solid #e6e8ec; border-radius: 14px; padding: 2rem; box-shadow: 0 1px 2px rgba(16,24,40,.06); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; border-bottom: 2px solid ${tenant.theme.primary}; padding-bottom: 1rem; }
  .studio { font-size: 1.25rem; font-weight: 800; }
  .contact { margin-top: .25rem; font-size: .8rem; color: #5b6577; }
  h1 { font-size: 1.05rem; margin: 0; color: ${tenant.theme.primary}; }
  .num { font-size: .8rem; color: #5b6577; margin-top: .25rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; margin: 1.5rem 0; font-size: .9rem; }
  dt { color: #5b6577; } dd { margin: 0; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: .9rem; }
  th, td { text-align: start; padding: .6rem .25rem; border-bottom: 1px solid #eceef1; }
  th { color: #5b6577; font-weight: 700; font-size: .78rem; }
  .total { text-align: start; font-size: 1.1rem; font-weight: 800; padding-top: 1rem; }
  .amount { font-variant-numeric: tabular-nums; }
  footer { margin-top: 1.75rem; padding-top: 1rem; border-top: 1px solid #eceef1; font-size: .72rem; color: #8b93a1; line-height: 1.6; }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div>
        <div class="studio">${escapeHtml(tenant.name)}</div>
        ${contactLine ? `<div class="contact">${escapeHtml(contactLine)}</div>` : ''}
      </div>
      <div style="text-align:start">
        <h1>${escapeHtml(title)}</h1>
        <div class="num">${escapeHtml(he.invoice.numberLabel)} ${escapeHtml(number)}</div>
      </div>
    </header>

    <dl>
      <dt>${escapeHtml(he.invoice.date)}</dt><dd class="amount">${escapeHtml(date)}</dd>
      <dt>${escapeHtml(he.invoice.from)}</dt><dd>${escapeHtml(tenant.name)}</dd>
    </dl>

    <table>
      <thead><tr><th>${escapeHtml(he.invoice.description)}</th><th style="text-align:end">${escapeHtml(he.invoice.amount)}</th></tr></thead>
      <tbody>
        <tr>
          <td>${escapeHtml(line.description || title)}</td>
          <td class="amount" style="text-align:end;font-weight:700">${escapeHtml(amount)}</td>
        </tr>
      </tbody>
    </table>

    <p class="total">${escapeHtml(he.invoice.total)}: <span class="amount">${escapeHtml(amount)}</span></p>

    <footer>${escapeHtml(he.invoice.generatedNote)}</footer>
  </div>
</body>
</html>`
}

/** Generate the invoice file for a line and prompt the browser to download it. */
export function downloadInvoice(line: LedgerLine, tenant: TenantConfig): void {
  const html = buildInvoiceHtml(line, tenant)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${he.invoice.title}-${invoiceNumberOf(line)}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
