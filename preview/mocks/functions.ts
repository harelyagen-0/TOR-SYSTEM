/**
 * In-memory stand-in for firebase/functions (artifact preview only).
 *
 * Reimplements the callables in functions/src/staff.ts closely enough that the
 * settings UI behaves for real: the same owner-only checks, the same
 * sole-owner and self-escalation guards, and the same claims sync that
 * onStaffWritten performs — so granting a permission actually changes what the
 * signed-in operator can see.
 */
import { Timestamp, __notify, __raw } from './firestore'
import { __createUser, __currentUid, __findByEmail, __refreshCurrent, __setClaims, __setDisabled, __setPassword } from './auth'

const TENANT = 'demo-yoga'
const AREAS = ['payments', 'customers', 'calendar', 'analytics', 'finance', 'settings'] as const
const CLAIM_KEYS: Record<string, string> = {
  payments: 'pay', customers: 'cus', calendar: 'cal',
  analytics: 'ana', finance: 'fin', settings: 'set',
}
const LEVELS: Record<string, number> = { none: 0, view: 1, edit: 2 }
const ROLE_PRESETS: Record<string, Record<string, string>> = {
  owner: { payments: 'edit', customers: 'edit', calendar: 'edit', analytics: 'edit', finance: 'edit', settings: 'edit' },
  manager: { payments: 'edit', customers: 'edit', calendar: 'edit', analytics: 'view', finance: 'view', settings: 'none' },
  staff: { payments: 'none', customers: 'view', calendar: 'edit', analytics: 'none', finance: 'none', settings: 'none' },
}

const staffCol = () => __raw(`tenants/${TENANT}/staff`)
const encode = (perms: Record<string, string>) =>
  Object.fromEntries(AREAS.map((a) => [CLAIM_KEYS[a], LEVELS[perms[a]] ?? 0]))

function sanitise(input: unknown, fallback: Record<string, string>) {
  const src = (input ?? {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const a of AREAS) {
    const v = src[a]
    out[a] = v === 'view' || v === 'edit' || v === 'none' ? v : fallback[a]
  }
  return out
}

class CallableError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

/** The claims half of onStaffWritten. */
function syncClaims(uid: string) {
  const doc = staffCol().get(uid) as Record<string, unknown> | undefined
  if (!doc || doc.active === false) {
    __setClaims(uid, null)
    __setDisabled(uid, true)
  } else {
    __setClaims(uid, {
      tenantId: TENANT,
      role: String(doc.role ?? 'staff'),
      perms: encode(doc.permissions as Record<string, string>),
    })
    __setDisabled(uid, false)
  }
  staffCol().set(uid, { ...(doc ?? {}), claimsUpdatedAt: Timestamp.now() })
  __notify()
  __refreshCurrent()
}

function requireOwner() {
  const uid = __currentUid()
  if (!uid) throw new CallableError('permission-denied', 'not signed in')
  const me = staffCol().get(uid) as Record<string, unknown> | undefined
  if (!me || me.role !== 'owner') throw new CallableError('permission-denied', 'owner only')
  return uid
}

function activeOwners(excluding?: string) {
  return [...staffCol().entries()]
    .filter(([id, d]) => id !== excluding && (d as Record<string, unknown>).role === 'owner' && (d as Record<string, unknown>).active !== false)
    .length
}

const password = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 12 }, () => abc[Math.floor(Math.random() * abc.length)]).join('')
}

type Handler = (data: Record<string, unknown>) => Promise<unknown>

const HANDLERS: Record<string, Handler> = {
  async createStaff(data) {
    const callerUid = requireOwner()
    const email = String(data.email ?? '').trim().toLowerCase()
    if (!email) throw new CallableError('invalid-argument', 'email is required')
    if (data.role === 'owner') throw new CallableError('invalid-argument', 'a tenant has exactly one owner')
    if (__findByEmail(email)) throw new CallableError('already-exists', 'email already in use')

    const role = String(data.role ?? 'staff')
    const permissions = sanitise(data.permissions, ROLE_PRESETS[role] ?? ROLE_PRESETS.staff)
    const tempPassword = password()
    const uid = __createUser(email, tempPassword)

    staffCol().set(uid, {
      firstName: String(data.firstName ?? ''), lastName: String(data.lastName ?? ''),
      email, phone: String(data.phone ?? ''), role, permissions, active: true,
      instructorId: (data.instructorId as string | null) ?? null,
      createdAt: Timestamp.now(), createdBy: callerUid,
    })
    syncClaims(uid)
    return { uid, tempPassword }
  },

  async updateStaff(data) {
    const callerUid = requireOwner()
    const uid = String(data.uid ?? '')
    const cur = staffCol().get(uid) as Record<string, unknown> | undefined
    if (!cur) throw new CallableError('not-found', 'no such staff member')

    const patch: Record<string, unknown> = { ...cur }
    if (typeof data.firstName === 'string') patch.firstName = data.firstName.trim()
    if (typeof data.lastName === 'string') patch.lastName = data.lastName.trim()
    if (typeof data.phone === 'string') patch.phone = data.phone
    if (typeof data.instructorId === 'string' || data.instructorId === null) patch.instructorId = data.instructorId

    const wantsRole = data.role !== undefined && data.role !== cur.role
    const wantsPerms = data.permissions !== undefined
    if (wantsRole || wantsPerms) {
      if (uid === callerUid) throw new CallableError('permission-denied', 'cannot change your own role or permissions')
      const role = String(data.role ?? cur.role)
      if (role === 'owner') throw new CallableError('invalid-argument', 'a tenant has exactly one owner')
      if (cur.role === 'owner' && activeOwners(uid) === 0) {
        throw new CallableError('failed-precondition', 'cannot demote the only owner')
      }
      patch.role = role
      patch.permissions = sanitise(wantsPerms ? data.permissions : cur.permissions, ROLE_PRESETS[role])
    }
    staffCol().set(uid, patch)
    syncClaims(uid)
    return { ok: true }
  },

  async setStaffActive(data) {
    const callerUid = requireOwner()
    const uid = String(data.uid ?? '')
    const active = data.active === true
    if (uid === callerUid && !active) throw new CallableError('permission-denied', 'cannot deactivate yourself')
    const cur = staffCol().get(uid) as Record<string, unknown> | undefined
    if (!cur) throw new CallableError('not-found', 'no such staff member')
    if (!active && cur.role === 'owner' && activeOwners(uid) === 0) {
      throw new CallableError('failed-precondition', 'cannot deactivate the only owner')
    }
    staffCol().set(uid, { ...cur, active })
    syncClaims(uid)
    return { ok: true }
  },

  async resetStaffPassword(data) {
    requireOwner()
    const uid = String(data.uid ?? '')
    if (!staffCol().get(uid)) throw new CallableError('not-found', 'no such staff member')
    const tempPassword = password()
    __setPassword(uid, tempPassword)
    return { tempPassword }
  },

  async resendReport() {
    // the real one compiles the ledger and mails the accountant; nothing to
    // send from a static page, so it just resolves
    return { ok: true }
  },
}

export function getFunctions(): unknown { return { __fns: true } }
export function connectFunctionsEmulator() { /* no emulator in the preview */ }

export function httpsCallable<Req = Record<string, unknown>, Res = unknown>(_fns: unknown, name: string) {
  return async (data?: Req): Promise<{ data: Res }> => {
    const handler = HANDLERS[name]
    if (!handler) throw new CallableError('not-found', `no callable named ${name}`)
    const result = await handler((data ?? {}) as Record<string, unknown>)
    return { data: result as Res }
  }
}
