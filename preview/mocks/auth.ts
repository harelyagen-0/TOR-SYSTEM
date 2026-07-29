/**
 * In-memory stand-in for firebase/auth (artifact preview only).
 *
 * Custom claims are the whole point here: the app reads `tenantId`, `role` and
 * `perms` off the ID token, so the preview keeps a claims record per user and
 * hands it back from getIdTokenResult — including on a forced refresh, which is
 * how AuthProvider picks up a permission change without a reload.
 */

export interface MockClaims { tenantId?: string; role?: string; perms?: Record<string, number> }

export interface User {
  uid: string
  email: string | null
  getIdTokenResult(forceRefresh?: boolean): Promise<{ claims: MockClaims }>
  getIdToken(forceRefresh?: boolean): Promise<string>
}

interface Account { uid: string; email: string; password: string; claims: MockClaims; disabled?: boolean }

const accounts = new Map<string, Account>()
let current: User | null = null
const watchers = new Set<(u: User | null) => void>()

function toUser(a: Account): User {
  return {
    uid: a.uid,
    email: a.email,
    async getIdTokenResult() {
      // always re-read from the account, so a claims change is visible on refresh
      const live = accounts.get(a.uid)
      return { claims: { ...(live?.claims ?? {}) } }
    },
    async getIdToken() { return `mock-token-${a.uid}` },
  }
}

export function __hydrateUsers(users: Array<{ uid: string; email: string; claims: MockClaims | null }>) {
  for (const u of users) {
    accounts.set(u.uid, { uid: u.uid, email: u.email, password: 'demo1234', claims: u.claims ?? {} })
  }
}

/** Mirrors what functions/src/staff.ts onStaffWritten does server-side. */
export function __setClaims(uid: string, claims: MockClaims | null) {
  const a = accounts.get(uid)
  if (!a) return
  a.claims = claims ?? {}
}
export function __setDisabled(uid: string, disabled: boolean) {
  const a = accounts.get(uid)
  if (a) a.disabled = disabled
}
export function __createUser(email: string, password: string): string {
  const uid = `uid-${Math.random().toString(36).slice(2, 10)}`
  accounts.set(uid, { uid, email, password, claims: {} })
  return uid
}
export function __findByEmail(email: string) {
  return [...accounts.values()].find((a) => a.email.toLowerCase() === email.toLowerCase())
}
export function __setPassword(uid: string, password: string) {
  const a = accounts.get(uid)
  if (a) a.password = password
}
export function __currentUid() { return current?.uid ?? null }

/** Re-reads claims for the signed-in user, as a forced token refresh would. */
export function __refreshCurrent() {
  if (!current) return
  const a = accounts.get(current.uid)
  if (!a || a.disabled) { current = null }
  for (const w of [...watchers]) w(current)
}

export function getAuth(): unknown { return { __auth: true } }
export function connectAuthEmulator() { /* no emulator in the preview */ }

export function onAuthStateChanged(_auth: unknown, cb: (u: User | null) => void) {
  watchers.add(cb)
  // deliver the current state asynchronously, like the real SDK
  queueMicrotask(() => cb(current))
  return () => { watchers.delete(cb) }
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const a = __findByEmail(email)
  if (!a || a.disabled || (a.password !== password)) {
    const err = new Error('auth/invalid-credential') as Error & { code: string }
    err.code = 'auth/invalid-credential'
    throw err
  }
  current = toUser(a)
  for (const w of [...watchers]) w(current)
  return { user: current }
}

export async function signOut() {
  current = null
  for (const w of [...watchers]) w(null)
}

/** Preview-only shortcut used by the role switcher. */
export async function __signInAs(email: string) {
  return signInWithEmailAndPassword(null, email, 'demo1234')
}
