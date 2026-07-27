/**
 * Integration adapters (spec §12). Each provider sits behind a TypeScript
 * interface with a mock implementation, so the app is fully testable without
 * live credentials and a different provider can be swapped per tenant
 * (tenant.integrations config decides which implementation is returned).
 */

export interface ChargeResult {
  transactionId: string
  status: 'paid' | 'failed'
}

export interface PaymentLinkResult {
  transactionId: string
  url: string
}

/** Grow (Meshulam) — [OPEN spec Q2]: API flavour, credentials, token model. */
export interface PaymentProvider {
  charge(amountIls: number, description: string): Promise<ChargeResult>
  createPaymentLink(amountIls: number, description: string): Promise<PaymentLinkResult>
  refund(transactionId: string, amountIls: number): Promise<{ ok: boolean }>
  chargeRecurring(token: string, amountIls: number): Promise<ChargeResult>
}

/** [OPEN spec §12]: WhatsApp via MiddleMan's API vs click-to-chat as v1. */
export interface MessageSender {
  sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean }>
  sendWhatsApp(phone: string, text: string): Promise<{ ok: boolean }>
}
