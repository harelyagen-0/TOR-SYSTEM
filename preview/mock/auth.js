// In-memory auth fake. Auto-signs-in the demo operator so the preview opens
// straight into the app; signOut returns to the login screen and any
// credentials sign back in. tenantId claim matches the seeded tenant.
const TENANT = 'demo-yoga'
const demoUser = {
  uid: 'op-demo',
  email: 'owner@demo.test',
  displayName: 'Studio Owner',
  emailVerified: true,
  async getIdTokenResult() { return { claims: { tenantId: TENANT } } },
  async getIdToken() { return 'demo-token' },
}
let current = demoUser // auto-login
const listeners = new Set()
const emit = () => { for (const cb of listeners) cb(current) }

export function getAuth() { return { get currentUser() { return current } } }
export function connectAuthEmulator() {}
export function onAuthStateChanged(_a, cb) { listeners.add(cb); Promise.resolve().then(() => cb(current)); return () => listeners.delete(cb) }
export async function signInWithEmailAndPassword(_a, email) { current = { ...demoUser, email: email || demoUser.email }; emit(); return { user: current } }
export async function signOut() { current = null; emit() }
export class User {}
