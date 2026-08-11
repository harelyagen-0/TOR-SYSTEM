/**
 * Demo stand-in for `firebase/auth` (VITE_DEMO=true).
 *
 * The demo signs the operator in automatically (tenant `demo-yoga`) so the
 * click-through lands straight in the app; the login screen still works — sign
 * out and any email/password signs back in.
 */
interface DemoUser {
  uid: string
  email: string | null
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>
}

const demoUser: DemoUser = {
  uid: 'demo-operator',
  email: 'owner@demo.test',
  async getIdTokenResult() {
    return { claims: { tenantId: 'demo-yoga' } }
  },
}

let current: DemoUser | null = demoUser
const callbacks = new Set<(u: DemoUser | null) => void>()

function emit(): void {
  for (const cb of [...callbacks]) cb(current)
}

export function getAuth(): Record<string, never> {
  return {}
}
export function connectAuthEmulator(): void {
  /* no-op in demo */
}
export function onAuthStateChanged(_auth: unknown, cb: (u: DemoUser | null) => void): () => void {
  callbacks.add(cb)
  Promise.resolve().then(() => cb(current))
  return () => callbacks.delete(cb)
}
export async function signInWithEmailAndPassword(_auth: unknown, email: string): Promise<{ user: DemoUser }> {
  current = { ...demoUser, email }
  emit()
  return { user: current }
}
export async function signOut(): Promise<void> {
  current = null
  emit()
}

export type User = DemoUser
