/**
 * Entitlement lifecycle. Punch cards expire (a daily job flips active→expired
 * past their expiresAt), and an operator can make an audited manual balance
 * adjustment (a correction is visible, never silent editing of `remaining`).
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { audit } from './lib.js'

const db = getFirestore()

export async function expireEntitlementsForTenant(tenantId: string): Promise<number> {
  const now = Timestamp.now()
  const snap = await db.collection(`tenants/${tenantId}/entitlements`)
    .where('status', '==', 'active').where('expiresAt', '<', now).get()
  const batch = db.batch()
  snap.forEach((d) => batch.update(d.ref, { status: 'expired' }))
  if (!snap.empty) await batch.commit()
  return snap.size
}

export const expireEntitlements = onSchedule(
  { schedule: 'every day 02:30', timeZone: 'Asia/Jerusalem' },
  async () => {
    const tenants = await db.collection('tenants').get()
    for (const t of tenants.docs) {
      const n = await expireEntitlementsForTenant(t.id)
      if (n) logger.info(`expired ${n} entitlements for ${t.id}`)
    }
  },
)

export const adjustEntitlement = onCall(async (request) => {
  const tenantId = request.auth?.token?.tenantId
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('permission-denied', 'no tenant claim')
  const { entitlementId, remaining, reason } = request.data as { entitlementId: string; remaining: number; reason?: string }
  if (!entitlementId || !Number.isInteger(remaining) || remaining < 0) {
    throw new HttpsError('invalid-argument', 'entitlementId and non-negative integer remaining required')
  }
  const ref = db.doc(`tenants/${tenantId}/entitlements/${entitlementId}`)
  const ent = (await ref.get()).data()
  if (!ent) throw new HttpsError('not-found', 'entitlement not found')
  await ref.update({
    remaining,
    status: remaining > 0 ? 'active' : 'used',
    adjustedAt: FieldValue.serverTimestamp(),
  })
  await audit(tenantId, request.auth!.uid, 'entitlement.adjust', entitlementId, {
    from: ent.remaining ?? null, to: remaining, reason: reason ?? null,
  })
  return { ok: true }
})
