// Dumps the seeded emulator Firestore under tenants/demo-yoga into a single
// JSON the mock-firebase preview embeds. Timestamps become {__ts: millis}.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { writeFileSync } from 'node:fs'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
initializeApp({ projectId: 'studio-os-demo' })
const db = getFirestore()

const TENANT = 'demo-yoga'

function encode(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() }
  if (Array.isArray(v)) return v.map(encode)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, val] of Object.entries(v)) o[k] = encode(val)
    return o
  }
  return v
}

async function dumpCollection(ref) {
  const snap = await ref.get()
  const docs = {}
  for (const d of snap.docs) {
    docs[d.id] = encode(d.data())
    // one level of known subcollections (counters etc.)
    const subs = await d.ref.listCollections()
    if (subs.length) {
      docs[d.id].__sub = {}
      for (const s of subs) docs[d.id].__sub[s.id] = await dumpCollection(s)
    }
  }
  return docs
}

const tenantRef = db.doc(`tenants/${TENANT}`)
const tenantSnap = await tenantRef.get()
const out = {
  tenantId: TENANT,
  tenantDoc: encode(tenantSnap.data()),
  collections: {},
}

const cols = await tenantRef.listCollections()
for (const c of cols) {
  out.collections[c.id] = await dumpCollection(c)
  console.error(`  ${c.id}: ${Object.keys(out.collections[c.id]).length} docs`)
}

writeFileSync(process.argv[2], JSON.stringify(out))
console.error('wrote', process.argv[2])
