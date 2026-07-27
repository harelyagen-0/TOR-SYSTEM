import type { MessageSender, PaymentProvider } from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const txId = () => `grow_mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Always-succeeds Grow stand-in; latency simulated so UIs handle pending states. */
export const mockPaymentProvider: PaymentProvider = {
  async charge() {
    await delay(600)
    return { transactionId: txId(), status: 'paid' }
  },
  async createPaymentLink() {
    await delay(400)
    const id = txId()
    return { transactionId: id, url: `https://pay.example.test/${id}` }
  },
  async refund() {
    await delay(500)
    return { ok: true }
  },
  async chargeRecurring() {
    await delay(600)
    return { transactionId: txId(), status: 'paid' }
  },
}

export const mockMessageSender: MessageSender = {
  async sendEmail(to) {
    await delay(300)
    console.info(`[mock email] → ${to}`)
    return { ok: true }
  },
  async sendWhatsApp(phone) {
    await delay(300)
    console.info(`[mock whatsapp] → ${phone}`)
    return { ok: true }
  },
}
