/**
 * Server-side integration adapters. Payment charging MUST be server-side (a
 * client can't hold Grow credentials), so the provider lives here, mirroring
 * the client interface in src/integrations/types.ts. The mock always succeeds;
 * the real Grow adapter (spec Q2) drops in behind this same interface.
 */
import { logger } from 'firebase-functions'

export interface ChargeResult { transactionId: string; status: 'paid' | 'failed' }
export interface PaymentLinkResult { transactionId: string; url: string }

export interface PaymentProvider {
  charge(amountAgorot: number, description: string): Promise<ChargeResult>
  createPaymentLink(amountAgorot: number, description: string): Promise<PaymentLinkResult>
  refund(transactionId: string, amountAgorot: number): Promise<{ ok: boolean }>
  chargeRecurring(token: string, amountAgorot: number): Promise<ChargeResult>
}

const txId = () => `grow_mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const mockPaymentProvider: PaymentProvider = {
  async charge() { return { transactionId: txId(), status: 'paid' } },
  async createPaymentLink(amount) {
    const id = txId()
    return { transactionId: id, url: `https://pay.example.test/${id}?a=${amount}` }
  },
  async refund() { return { ok: true } },
  async chargeRecurring() { return { transactionId: txId(), status: 'paid' } },
}

/** [OPEN spec Q2] real Grow adapter, keyed off tenant.integrations.grow. */
export function paymentProviderFor(_tenantRaw: Record<string, unknown>): PaymentProvider {
  return mockPaymentProvider
}

export interface MessageSender {
  sendEmail(to: string, subject: string, body: string, attachmentUrl?: string): Promise<void>
}
export const mockMessageSender: MessageSender = {
  async sendEmail(to, subject) { logger.info(`[mock email] to=${to} subject=${subject}`) },
}
export function messageSenderFor(_tenantRaw: Record<string, unknown>): MessageSender {
  return mockMessageSender
}
