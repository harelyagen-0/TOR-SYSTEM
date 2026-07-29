/**
 * Dumps the seeded emulator state to JSON for the offline preview build.
 *
 * Reading the real seed rather than re-declaring demo data keeps the preview
 * honest: what you click through is exactly what `npm run seed` produces.
 *
 * Usage: npm run emulators && npm run seed && node preview/dump-seed.mjs
 */
import { writeFileSync } from 'node:fs'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

const TENANT = 'demo-yoga'
const COLLECTIONS = [
  'customers', 'products', 'payments', 'invoices', 'entitlements', 'subscriptions',
  'promoCodes', 'expenses', 'instructors', 'classTemplates', 'recurrences',
  'sessions', 'registrations', 'ledger', 'reports', 'counters', 'staff',
]

initializeApp({ projectId: 'studio-os-demo' })
const db = getFirestore()
const auth = getAuth()

/** Timestamps survive the JSON round trip as {__ts: millis}. */
function encode(value) {
  if (value instanceof Timestamp) return { __ts: value.toMillis() }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = encode(v)
    return out
  }
  return value
}

const out = { tenantId: TENANT, tenant: null, collections: {}, users: [] }

const tenantSnap = await db.doc(`tenants/${TENANT}`).get()
out.tenant = encode(tenantSnap.data())

for (const name of COLLECTIONS) {
  const snap = await db.collection(`tenants/${TENANT}/${name}`).get()
  out.collections[name] = snap.docs.map((d) => ({ id: d.id, data: encode(d.data()) }))
}

// auth users + the custom claims the rules and the client both read
const list = await auth.listUsers(50)
for (const u of list.users) {
  out.users.push({ uid: u.uid, email: u.email, claims: u.customClaims ?? null })
}

writeFileSync(new URL('./seed-data.json', import.meta.url), JSON.stringify(out))
const counts = Object.entries(out.collections).map(([k, v]) => `${k}:${v.length}`).join(' ')
console.log('users:', out.users.map((u) => `${u.email}(${u.claims?.role})`).join(' '))
console.log(counts)
console.log('wrote preview/seed-data.json')
