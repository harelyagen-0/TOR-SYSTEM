/**
 * Staff provisioning and the claims that firestore.rules actually enforces.
 *
 * The staff doc (`tenants/{tenantId}/staff/{uid}`, doc id = the Auth uid) is the
 * editable source of truth; `onStaffWritten` mirrors role + permissions into
 * the user's custom claims. Rules read ONLY the claims, so a client that writes
 * a staff doc directly could otherwise grant itself anything — hence the
 * collection is write-denied in rules and every mutation lands here.
 *
 * Invariants enforced on every callable:
 *  - tenantId comes from the CALLER'S OWN claim, never the request body
 *  - only an owner may create, edit, deactivate or reset a staff member
 *  - exactly one owner per tenant: the sole owner can't be demoted, deactivated
 *    or duplicated, and the owner's permissions are locked to the preset
 *  - nobody may edit their own role or permissions (no self-escalation)
 *
 * Staff are DEACTIVATED, never deleted: Payment.createdBy stores a raw uid and
 * a hard delete would orphan that history.
 */
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import {
  ROLE_PRESETS,
  encodePermissions,
  isStaffRole,
  sanitisePermissions,
  type Permissions,
  type StaffRole,
} from './permissions.js'

/**
 * Resolved lazily, never at module scope: ES imports are evaluated before the
 * importing module's body, so a top-level getFirestore() here would run before
 * index.ts calls initializeApp(). firebase-admin caches the instance, so this
 * is free after the first call.
 */
const db = () => getFirestore()

// ── claims sync ─────────────────────────────────────────────────────────────
/**
 * Keeps custom claims in step with the staff doc. An inactive member loses
 * their claims AND has their Auth user disabled, so an open session dies at the
 * next token refresh instead of lingering for up to an hour.
 */
export const onStaffWritten = onDocumentWritten(
  'tenants/{tenantId}/staff/{uid}',
  async (event) => {
    const { tenantId, uid } = event.params as { tenantId: string; uid: string }
    const after = event.data?.after?.data()
    const before = event.data?.before?.data()
    const auth = getAuth()

    // deleted, or deactivated → revoke everything
    if (!after || after.active === false) {
      try {
        await auth.setCustomUserClaims(uid, null)
        await auth.updateUser(uid, { disabled: true })
      } catch (err) {
        logger.warn(`could not revoke claims for ${uid}`, err)
      }
      if (after) await touchClaims(tenantId, uid)
      return
    }

    // ignore our own claimsUpdatedAt write-back (otherwise this loops forever)
    if (before && !permissionsChanged(before, after) && before.active === after.active) return

    const role = isStaffRole(after.role) ? after.role : 'staff'
    const permissions = sanitisePermissions(after.permissions, ROLE_PRESETS[role])

    try {
      await auth.setCustomUserClaims(uid, {
        tenantId,
        role,
        perms: encodePermissions(permissions),
      })
      await auth.updateUser(uid, { disabled: false })
    } catch (err) {
      logger.error(`could not set claims for ${uid}`, err)
      return
    }
    await touchClaims(tenantId, uid)
  },
)

/**
 * The marker the client watches to know it should call getIdToken(true).
 * This write retriggers onStaffWritten once; that second pass sees no change
 * to role/permissions/active and returns early, so it terminates.
 */
async function touchClaims(tenantId: string, uid: string) {
  await db()
    .doc(`tenants/${tenantId}/staff/${uid}`)
    .set({ claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
}

function permissionsChanged(
  before: FirebaseFirestore.DocumentData,
  after: FirebaseFirestore.DocumentData,
): boolean {
  if (before.role !== after.role) return true
  return JSON.stringify(before.permissions ?? {}) !== JSON.stringify(after.permissions ?? {})
}

// ── caller authorisation ────────────────────────────────────────────────────
interface Caller {
  tenantId: string
  uid: string
}

/** Every callable starts here: tenant from the claim, owner role required. */
function requireOwner(request: CallableRequest): Caller {
  const tenantId = request.auth?.token?.tenantId
  const uid = request.auth?.uid
  if (typeof tenantId !== 'string' || !tenantId || !uid) {
    throw new HttpsError('permission-denied', 'no tenant claim')
  }
  if (request.auth?.token?.role !== 'owner') {
    throw new HttpsError('permission-denied', 'owner only')
  }
  return { tenantId, uid }
}

function staffCol(tenantId: string) {
  return db().collection(`tenants/${tenantId}/staff`)
}

async function countActiveOwners(tenantId: string, excludingUid?: string): Promise<number> {
  const snap = await staffCol(tenantId).where('role', '==', 'owner').get()
  return snap.docs.filter((d) => d.id !== excludingUid && d.data().active !== false).length
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${field} is required`)
  }
  return value.trim()
}

/** Temp password handed to the new member out of band — no email transport
 *  exists in this repo (MessageSender is a mock that logs). */
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

// ── callables ───────────────────────────────────────────────────────────────
export const createStaff = onCall(async (request) => {
  const { tenantId, uid: callerUid } = requireOwner(request)
  const data = request.data ?? {}

  const firstName = requiredString(data.firstName, 'firstName')
  const lastName = requiredString(data.lastName, 'lastName')
  const email = requiredString(data.email, 'email').toLowerCase()
  const role: StaffRole = isStaffRole(data.role) ? data.role : 'staff'

  // a second owner would make "the sole owner" ambiguous everywhere below
  if (role === 'owner') {
    throw new HttpsError('invalid-argument', 'a tenant has exactly one owner')
  }

  const permissions: Permissions = sanitisePermissions(data.permissions, ROLE_PRESETS[role])
  const auth = getAuth()

  // reject an email that already belongs to someone (in this tenant or another)
  const existing = await auth.getUserByEmail(email).catch(() => null)
  if (existing) throw new HttpsError('already-exists', 'email already in use')

  const tempPassword = generatePassword()
  const user = await auth.createUser({
    email,
    password: tempPassword,
    displayName: `${firstName} ${lastName}`,
  })

  await staffCol(tenantId).doc(user.uid).set({
    firstName,
    lastName,
    email,
    phone: typeof data.phone === 'string' ? data.phone : '',
    role,
    permissions,
    active: true,
    instructorId: typeof data.instructorId === 'string' ? data.instructorId : null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: callerUid,
  })

  // onStaffWritten sets the claims; returning the password is the only time
  // it is ever visible
  return { uid: user.uid, tempPassword }
})

export const updateStaff = onCall(async (request) => {
  const { tenantId, uid: callerUid } = requireOwner(request)
  const data = request.data ?? {}
  const uid = requiredString(data.uid, 'uid')

  const ref = staffCol(tenantId).doc(uid)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'no such staff member')
  const current = snap.data()!

  const patch: Record<string, unknown> = {}
  if (typeof data.firstName === 'string') patch.firstName = data.firstName.trim()
  if (typeof data.lastName === 'string') patch.lastName = data.lastName.trim()
  if (typeof data.phone === 'string') patch.phone = data.phone
  if (typeof data.instructorId === 'string' || data.instructorId === null) {
    patch.instructorId = data.instructorId
  }

  const wantsRoleChange = data.role !== undefined && data.role !== current.role
  const wantsPermsChange = data.permissions !== undefined

  if (wantsRoleChange || wantsPermsChange) {
    // no self-escalation, even for the owner
    if (uid === callerUid) {
      throw new HttpsError('permission-denied', 'cannot change your own role or permissions')
    }
    const role: StaffRole = isStaffRole(data.role) ? data.role : (current.role as StaffRole)
    if (role === 'owner') {
      throw new HttpsError('invalid-argument', 'a tenant has exactly one owner')
    }
    // demoting the last owner would leave the tenant unadministrable
    // (`role` is necessarily non-owner here — the check above threw otherwise)
    if (current.role === 'owner' && (await countActiveOwners(tenantId, uid)) === 0) {
      throw new HttpsError('failed-precondition', 'cannot demote the only owner')
    }
    patch.role = role
    patch.permissions = sanitisePermissions(
      wantsPermsChange ? data.permissions : current.permissions,
      ROLE_PRESETS[role],
    )
  }

  if (Object.keys(patch).length === 0) return { ok: true }
  await ref.update(patch)
  return { ok: true }
})

export const setStaffActive = onCall(async (request) => {
  const { tenantId, uid: callerUid } = requireOwner(request)
  const data = request.data ?? {}
  const uid = requiredString(data.uid, 'uid')
  const active = data.active === true

  if (uid === callerUid && !active) {
    throw new HttpsError('permission-denied', 'cannot deactivate yourself')
  }

  const ref = staffCol(tenantId).doc(uid)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'no such staff member')

  if (!active && snap.data()!.role === 'owner') {
    if ((await countActiveOwners(tenantId, uid)) === 0) {
      throw new HttpsError('failed-precondition', 'cannot deactivate the only owner')
    }
  }

  await ref.update({ active })
  return { ok: true }
})

export const resetStaffPassword = onCall(async (request) => {
  const { tenantId } = requireOwner(request)
  const uid = requiredString((request.data ?? {}).uid, 'uid')

  const snap = await staffCol(tenantId).doc(uid).get()
  if (!snap.exists) throw new HttpsError('not-found', 'no such staff member')

  const tempPassword = generatePassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return { tempPassword }
})
