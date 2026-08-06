/**
 * Customer creation is a callable (the client can no longer write the customers
 * collection or the counter directly). The human-readable publicId is allocated
 * transactionally so two operators never collide.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { audit } from './lib.js'

const db = getFirestore()

export interface NewCustomer {
  firstName: string
  lastName?: string
  phone: string
  email?: string
}

/** Normalise an Israeli phone to a comparable digit form (E.164-ish). */
export function normalisePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  return digits ? `+972${digits}` : ''
}

/** Creates a customer + allocates publicId in one transaction. Returns its id. */
export async function allocateCustomer(tenantId: string, input: NewCustomer): Promise<{ id: string; publicId: string }> {
  const counterRef = db.doc(`tenants/${tenantId}/counters/customers`)
  const customerRef = db.collection(`tenants/${tenantId}/customers`).doc()
  const publicId = await db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef)
    const next = (counter.data()?.next as number | undefined) ?? 1
    const pid = `C-${String(next).padStart(4, '0')}`
    tx.set(counterRef, { next: next + 1 }, { merge: true })
    tx.set(customerRef, {
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      phone: input.phone,
      phoneNormalised: normalisePhone(input.phone),
      email: input.email ?? '',
      publicId: pid,
      isWalkIn: false,
      notes: '',
      stats: { totalSpent: 0, sessionsAttended: 0, lastVisitAt: null },
      createdAt: FieldValue.serverTimestamp(),
    })
    return pid
  })
  return { id: customerRef.id, publicId }
}

export const createCustomer = onCall(async (request) => {
  const tenantId = request.auth?.token?.tenantId
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('permission-denied', 'no tenant claim')
  const input = request.data as NewCustomer
  if (!input?.firstName?.trim() || !input?.phone?.trim()) {
    throw new HttpsError('invalid-argument', 'firstName and phone are required')
  }
  const result = await allocateCustomer(tenantId, {
    firstName: input.firstName.trim(),
    lastName: input.lastName?.trim() ?? '',
    phone: input.phone.trim(),
    email: input.email?.trim() ?? '',
  })
  await audit(tenantId, request.auth!.uid, 'customer.create', result.id, { publicId: result.publicId })
  return result
})
