import type { TenantConfig } from '../types/models'
import { mockMessageSender, mockPaymentProvider } from './mocks'
import type { MessageSender, PaymentProvider } from './types'

/**
 * Provider selection per tenant. When real integrations exist, the tenant's
 * integrations config picks the implementation; unconfigured tenants keep the
 * mocks so every flow stays demonstrable.
 */
export function getPaymentProvider(_tenant: TenantConfig): PaymentProvider {
  // [OPEN spec Q2] real Grow adapter lands here, keyed off tenant.integrations.grow
  return mockPaymentProvider
}

export function getMessageSender(_tenant: TenantConfig): MessageSender {
  // [OPEN spec §12] real transport lands here, keyed off tenant.integrations.whatsapp
  return mockMessageSender
}

export type { MessageSender, PaymentProvider } from './types'
