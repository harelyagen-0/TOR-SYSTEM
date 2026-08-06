/**
 * Vendor + operator provisioning (P0-1). The tenantId custom claim is the only
 * trust anchor, and nothing in production could mint it before this file.
 *
 *   provisionTenant  — vendorAdmin only: creates the tenant doc, the operator
 *                      user + claim, and the sequence counters.
 *   addOperator      — an existing operator (or vendorAdmin) grants a colleague
 *                      access to the SAME tenant (never another).
 *   removeOperator   — revokes a colleague's access.
 *
 * Custom claims only refresh on token rotation (~1h), so the client must call
 * getIdToken(true) after these — the responses say so via `refreshRequired`.
 * Bootstrap the first vendorAdmin with scripts/grant-admin.mjs.
 */
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { audit } from './lib.js'

const db = getFirestore()

interface ProvisionInput {
  tenantId: string
  name: string
  timezone?: string
  currency?: string
  locale?: string
  theme?: { primary: string; accent: string; surface: string; text: string }
  classTypes?: { id: string; labelHe: string; color: string }[]
  accountant?: { name: string; email: string }
  vat?: { rate: number; inclusive: boolean; registered: boolean }
  operatorEmail: string
  operatorPassword?: string
}

const DEFAULT_THEME = { primary: '#0070f3', accent: '#0070f3', surface: '#ffffff', text: '#0b0f1a' }

export const provisionTenant = onCall(async (request) => {
  if (request.auth?.token?.vendorAdmin !== true) throw new HttpsError('permission-denied', 'vendorAdmin only')
  const input = request.data as ProvisionInput
  if (!input?.tenantId?.trim() || !input?.name?.trim() || !input?.operatorEmail?.trim()) {
    throw new HttpsError('invalid-argument', 'tenantId, name and operatorEmail required')
  }
  const tenantId = input.tenantId.trim()

  const tenantRef = db.doc(`tenants/${tenantId}`)
  if ((await tenantRef.get()).exists) throw new HttpsError('already-exists', 'tenant exists')

  // operator user + tenant claim
  const auth = getAuth()
  let user
  try {
    user = await auth.getUserByEmail(input.operatorEmail.trim())
  } catch {
    user = await auth.createUser({
      email: input.operatorEmail.trim(),
      password: input.operatorPassword || Math.random().toString(36).slice(2) + 'A1!',
    })
  }
  await auth.setCustomUserClaims(user.uid, { tenantId })

  await tenantRef.set({
    name: input.name.trim(),
    logoUrl: null,
    timezone: input.timezone ?? 'Asia/Jerusalem',
    currency: input.currency ?? 'ILS',
    locale: input.locale ?? 'he-IL',
    theme: input.theme ?? DEFAULT_THEME,
    classTypes: input.classTypes ?? [],
    accountant: input.accountant ?? null,
    vat: input.vat ?? { rate: 0.18, inclusive: true, registered: true },
    policy: { lateCancelHours: 6, lateCancelCharges: true },
    integrations: { grow: null, invoicing: null, whatsapp: null },
    createdAt: FieldValue.serverTimestamp(),
  })
  await db.doc(`tenants/${tenantId}/counters/customers`).set({ next: 1 })
  await db.doc(`tenants/${tenantId}/operators/${user.uid}`).set({
    email: input.operatorEmail.trim(), addedAt: FieldValue.serverTimestamp(),
  })

  return { ok: true, tenantId, operatorUid: user.uid, refreshRequired: true }
})

export const addOperator = onCall(async (request) => {
  const tenantId = request.auth?.token?.tenantId
  const isVendor = request.auth?.token?.vendorAdmin === true
  if (!isVendor && (typeof tenantId !== 'string' || !tenantId)) throw new HttpsError('permission-denied', 'no tenant claim')
  const { email, targetTenantId } = request.data as { email: string; targetTenantId?: string }
  const tid = isVendor ? (targetTenantId ?? tenantId) : tenantId
  if (typeof tid !== 'string' || !tid || !email?.trim()) throw new HttpsError('invalid-argument', 'email required')

  const auth = getAuth()
  let user
  try { user = await auth.getUserByEmail(email.trim()) } catch {
    throw new HttpsError('not-found', 'no user with that email — they must sign up first')
  }
  await auth.setCustomUserClaims(user.uid, { tenantId: tid })
  await db.doc(`tenants/${tid}/operators/${user.uid}`).set({
    email: email.trim(), addedAt: FieldValue.serverTimestamp(),
  })
  await audit(tid, request.auth!.uid, 'operator.add', user.uid, { email: email.trim() })
  return { ok: true, uid: user.uid, refreshRequired: true }
})

export const removeOperator = onCall(async (request) => {
  const tenantId = request.auth?.token?.tenantId
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('permission-denied', 'no tenant claim')
  const { uid } = request.data as { uid: string }
  if (!uid) throw new HttpsError('invalid-argument', 'uid required')
  if (uid === request.auth!.uid) throw new HttpsError('failed-precondition', 'cannot remove yourself')
  const auth = getAuth()
  await auth.setCustomUserClaims(uid, {})
  await db.doc(`tenants/${tenantId}/operators/${uid}`).delete()
  await audit(tenantId, request.auth!.uid, 'operator.remove', uid)
  return { ok: true }
})
