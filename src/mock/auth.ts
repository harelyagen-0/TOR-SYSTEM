/**
 * `firebase/auth` stand-in for the preview build. Starts signed in as the demo
 * operator so the link opens straight into the app; sign-out returns to the
 * login screen, where owner@demo.test / demo1234 signs back in.
 */
import './seed' // ensure the store is seeded before anyone reads a claim

export const OPERATOR_UID = 'op-demo'
const TENANT_ID = 'demo-yoga'

export interface MockUser {
  uid: string
  email: string
  getIdTokenResult: () => Promise<{ claims: { tenantId: string } }>
}

const demoUser: MockUser = {
  uid: OPERATOR_UID,
  email: 'owner@demo.test',
  getIdTokenResult: async () => ({ claims: { tenantId: TENANT_ID } }),
}

let currentUser: MockUser | null = demoUser // auto-authenticated
const listeners = new Set<(u: MockUser | null) => void>()
const emit = () => listeners.forEach((cb) => cb(currentUser))

export function getAuth() { return {} }
export function connectAuthEmulator() { /* no-op */ }

export function onAuthStateChanged(_auth: unknown, cb: (u: MockUser | null) => void): () => void {
  listeners.add(cb)
  Promise.resolve().then(() => cb(currentUser))
  return () => listeners.delete(cb)
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  await new Promise((r) => setTimeout(r, 150))
  if (email.trim().toLowerCase() === 'owner@demo.test' && password === 'demo1234') {
    currentUser = demoUser
    emit()
    return { user: currentUser }
  }
  const err = new Error('auth/invalid-credential') as Error & { code: string }
  err.code = 'auth/invalid-credential'
  throw err
}

export async function signOut() {
  currentUser = null
  emit()
}

export type { MockUser as User }
