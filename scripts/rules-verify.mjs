/**
 * Verifies that firestore.rules ENFORCES the staff permission model — that the
 * UI gating in the app is backed by real server-side denial, not just hidden
 * buttons.
 *
 * The emulator accepts unsigned JWTs (alg: none) as auth tokens, so each case
 * runs with a hand-built claim set; the literal bearer token "owner" is the
 * emulator's admin escape hatch, used only to lay down fixtures.
 *
 * Usage:  npm run emulators   (in another terminal)
 *         npm run verify:rules
 *
 * Writes only to tenant `demo-yoga`, so run `npm run seed` afterwards to
 * restore the demo data.
 */
const HOST = 'http://127.0.0.1:8080'
const PROJECT = 'studio-os-demo'
const BASE = `${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`
const TENANT = 'demo-yoga'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function token(uid, claims) {
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    auth_time: Math.floor(Date.now() / 1000),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: 'password', identities: {} },
    ...claims,
  })}.`
}

const P = (pay, cus, cal, ana, fin, set) => ({ pay, cus, cal, ana, fin, set })
const OWNER = token('uid-owner', { tenantId: TENANT, role: 'owner', perms: P(2, 2, 2, 2, 2, 2) })
const STAFF = token('uid-staff', { tenantId: TENANT, role: 'staff', perms: P(0, 1, 2, 0, 0, 0) })
const MANAGER = token('uid-mgr', { tenantId: TENANT, role: 'manager', perms: P(2, 2, 2, 1, 1, 0) })
// a token issued before roles existed: tenantId but no perms map
const LEGACY = token('uid-legacy', { tenantId: TENANT })
const OTHER_TENANT = token('uid-other', { tenantId: 'other-studio', role: 'owner', perms: P(2, 2, 2, 2, 2, 2) })

async function req(method, path, auth, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res.status
}

const doc = (fields) => ({ fields })
const S = (v) => ({ stringValue: v })

// ── fixtures (admin bearer bypasses rules) ──────────────────────────────────
await req('PATCH', `/tenants/${TENANT}`, 'owner', doc({ name: S('Studio'), timezone: S('Asia/Jerusalem') }))
await req('PATCH', `/tenants/${TENANT}/customers/c1`, 'owner', doc({ firstName: S('A') }))
await req('PATCH', `/tenants/${TENANT}/payments/p1`, 'owner', doc({ amount: { integerValue: '50' } }))
await req('PATCH', `/tenants/${TENANT}/ledger/l1`, 'owner', doc({ amount: { integerValue: '50' } }))
await req('PATCH', `/tenants/${TENANT}/staff/uid-staff`, 'owner', doc({ role: S('staff') }))
await req('PATCH', `/tenants/${TENANT}/sessions/s1`, 'owner', doc({ title: S('Yoga') }))

const OK = 200
const DENIED = 403
let pass = 0
let fail = 0

async function check(label, expected, method, path, auth, body) {
  const got = await req(method, path, auth, body)
  const ok = expected === OK ? got === 200 : got === 403
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (want ${expected === OK ? 'allow' : 'deny'}, got ${got})`)
  if (ok) pass++
  else fail++
}

console.log('\n── tenant isolation ────────────────────────────────────────')
await check('other tenant cannot read customers', DENIED, 'GET', `/tenants/${TENANT}/customers/c1`, OTHER_TENANT)
await check('unauthenticated cannot read customers', DENIED, 'GET', `/tenants/${TENANT}/customers/c1`, null)

console.log('\n── legacy token (tenantId, no perms) fails CLOSED ──────────')
await check('legacy cannot read customers', DENIED, 'GET', `/tenants/${TENANT}/customers/c1`, LEGACY)
await check('legacy cannot write customers', DENIED, 'PATCH', `/tenants/${TENANT}/customers/c9`, LEGACY, doc({ firstName: S('x') }))
await check('legacy CAN read tenant doc', OK, 'GET', `/tenants/${TENANT}`, LEGACY)

console.log('\n── staff: customers view-only ──────────────────────────────')
await check('staff can read customers', OK, 'GET', `/tenants/${TENANT}/customers/c1`, STAFF)
await check('staff CANNOT write customers', DENIED, 'PATCH', `/tenants/${TENANT}/customers/c1`, STAFF, doc({ firstName: S('hacked') }))

console.log('\n── staff: payments locked out entirely ─────────────────────')
await check('staff CANNOT read payments', DENIED, 'GET', `/tenants/${TENANT}/payments/p1`, STAFF)
await check('staff CANNOT write payments', DENIED, 'PATCH', `/tenants/${TENANT}/payments/p2`, STAFF, doc({ amount: { integerValue: '1' } }))
await check('staff CANNOT read ledger', DENIED, 'GET', `/tenants/${TENANT}/ledger/l1`, STAFF)

console.log('\n── staff: calendar is editable ─────────────────────────────')
await check('staff can read sessions', OK, 'GET', `/tenants/${TENANT}/sessions/s1`, STAFF)
await check('staff can write sessions', OK, 'PATCH', `/tenants/${TENANT}/sessions/s2`, STAFF, doc({ title: S('New') }))

console.log('\n── manager: finance view-only, no settings ─────────────────')
await check('manager can read ledger', OK, 'GET', `/tenants/${TENANT}/ledger/l1`, MANAGER)
await check('manager CANNOT write expenses', DENIED, 'PATCH', `/tenants/${TENANT}/expenses/e1`, MANAGER, doc({ amount: { integerValue: '5' } }))
await check('manager CANNOT write tenant config', DENIED, 'PATCH', `/tenants/${TENANT}?updateMask.fieldPaths=name`, MANAGER, doc({ name: S('nope') }))

console.log('\n── owner: settings write, allowlisted keys only ────────────')
await check('owner can write tenant name', OK, 'PATCH', `/tenants/${TENANT}?updateMask.fieldPaths=name`, OWNER, doc({ name: S('New Name') }))
await check('owner can write policies', OK, 'PATCH', `/tenants/${TENANT}?updateMask.fieldPaths=policies`, OWNER, doc({ policies: { mapValue: { fields: { cancellationWindowHours: { integerValue: '12' } } } } }))
await check('owner CANNOT write integrations (credentials)', DENIED, 'PATCH', `/tenants/${TENANT}?updateMask.fieldPaths=integrations`, OWNER, doc({ integrations: { mapValue: { fields: { grow: S('secret') } } } }))

console.log('\n── staff collection is write-denied to everyone ────────────')
await check('owner CANNOT write staff docs directly', DENIED, 'PATCH', `/tenants/${TENANT}/staff/uid-staff`, OWNER, doc({ role: S('owner') }))
await check('staff CANNOT self-escalate', DENIED, 'PATCH', `/tenants/${TENANT}/staff/uid-staff`, STAFF, doc({ role: S('owner') }))
await check('member CAN read own staff doc', OK, 'GET', `/tenants/${TENANT}/staff/uid-staff`, STAFF)
await check('staff CANNOT read another staff doc', DENIED, 'GET', `/tenants/${TENANT}/staff/uid-owner`, STAFF)
await check('owner CAN read any staff doc', OK, 'GET', `/tenants/${TENANT}/staff/uid-staff`, OWNER)

console.log('\n── function-owned collections stay write-denied ────────────')
await check('owner CANNOT write ledger', DENIED, 'PATCH', `/tenants/${TENANT}/ledger/l2`, OWNER, doc({ amount: { integerValue: '9' } }))
await check('owner CANNOT write invoices', DENIED, 'PATCH', `/tenants/${TENANT}/invoices/i1`, OWNER, doc({ number: S('1') }))

console.log(`\n════ ${pass} passed, ${fail} failed ════\n`)
process.exit(fail === 0 ? 0 : 1)
