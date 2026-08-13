// In-memory Firestore fake for the self-contained preview build. Implements the
// exact surface src/data/* uses: collection/doc/query/where/orderBy, getDoc(s),
// addDoc/setDoc/updateDoc/deleteDoc, onSnapshot, runTransaction, and the
// increment/arrayUnion/serverTimestamp/Timestamp sentinels. Seeded from the
// emulator export in ../seed-data.json.
import seed from '../seed-data.json'

export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds }
  static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6) }
  static fromDate(d) { return Timestamp.fromMillis(d.getTime()) }
  static now() { return Timestamp.fromMillis(Date.now()) }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6) }
  toDate() { return new Date(this.toMillis()) }
  valueOf() { return this.toMillis() }
}

const DB = { __isDb: true }
const store = new Map() // collectionPath -> Map(id -> data)
const colMap = (p) => { let m = store.get(p); if (!m) { m = new Map(); store.set(p, m) } return m }
const split = (path) => { const i = path.lastIndexOf('/'); return { colPath: path.slice(0, i), id: path.slice(i + 1) } }
const genId = () => 'id_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36)

// ── sentinels ────────────────────────────────────────────────────────────────
class Incr { constructor(n) { this.n = n } }
class ArrUnion { constructor(e) { this.e = e } }
class SrvTs {}
export const increment = (n) => new Incr(n)
export const arrayUnion = (...e) => new ArrUnion(e)
export const serverTimestamp = () => new SrvTs()

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function resolveDeep(val, existing) {
  if (val instanceof Incr) return (typeof existing === 'number' ? existing : 0) + val.n
  if (val instanceof ArrUnion) { const base = Array.isArray(existing) ? existing.slice() : []; for (const x of val.e) if (!base.some((b) => eq(b, x))) base.push(x); return base }
  if (val instanceof SrvTs) return Timestamp.now()
  if (val instanceof Timestamp || val instanceof Date) return val
  if (Array.isArray(val)) return val.map((v) => resolveDeep(v, undefined))
  if (val && typeof val === 'object') { const o = {}; const ex = existing && typeof existing === 'object' ? existing : {}; for (const [k, v] of Object.entries(val)) o[k] = resolveDeep(v, ex[k]); return o }
  return val
}
function clone(v) {
  if (v instanceof Timestamp || v instanceof Date) return v
  if (Array.isArray(v)) return v.map(clone)
  if (v && typeof v === 'object') { const o = {}; for (const [k, val] of Object.entries(v)) o[k] = clone(val); return o }
  return v
}
function deepMerge(a, b) {
  const o = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && a[k] && typeof a[k] === 'object') o[k] = deepMerge(a[k], v)
    else o[k] = v
  }
  return o
}
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]] } o[ks[ks.length - 1]] = val }
const getField = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

// ── refs ─────────────────────────────────────────────────────────────────────
const makeCol = (path, converter = null) => ({ __type: 'col', path, converter, withConverter(c) { return makeCol(path, c) } })
const makeDoc = (path, converter = null) => ({ __type: 'doc', path, id: path.slice(path.lastIndexOf('/') + 1), converter, withConverter(c) { return makeDoc(path, c) } })

export function collection(parent, ...segs) {
  const base = parent.__isDb ? '' : parent.path
  return makeCol([base, ...segs].filter(Boolean).join('/'))
}
export function doc(parent, ...segs) {
  if (parent.__isDb) return makeDoc(segs.join('/'))
  if (parent.__type === 'col') return makeDoc(parent.path + '/' + (segs.length ? segs.join('/') : genId()), parent.converter)
  return makeDoc(parent.path + '/' + segs.join('/'))
}

// ── snapshots ────────────────────────────────────────────────────────────────
const rawSnap = (id, raw) => ({ id, data: () => clone(raw), exists: () => raw !== undefined })
function docSnap(path, converter) {
  const { colPath, id } = split(path)
  const raw = colMap(colPath).get(id)
  const exists = raw !== undefined
  return { id, exists: () => exists, ref: makeDoc(path, converter), data: () => (exists ? (converter ? converter.fromFirestore(rawSnap(id, raw)) : clone(raw)) : undefined) }
}
const qDocSnap = (id, raw, converter) => ({ id, exists: () => true, ref: null, data: () => (converter ? converter.fromFirestore(rawSnap(id, raw)) : clone(raw)) })

// ── queries ──────────────────────────────────────────────────────────────────
export const where = (field, op, value) => ({ __c: 'where', field, op, value })
export const orderBy = (field, dir = 'asc') => ({ __c: 'orderBy', field, dir })
export const query = (col, ...constraints) => ({ __type: 'query', path: col.path, converter: col.converter, constraints })
export const limit = (n) => ({ __c: 'limit', n })

const norm = (v) => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : v)
function cmp(a, op, b) {
  switch (op) {
    case '==': return a === b
    case '!=': return a !== b
    case '<': return a < b
    case '<=': return a <= b
    case '>': return a > b
    case '>=': return a >= b
    case 'in': return Array.isArray(b) && b.includes(a)
    case 'array-contains': return Array.isArray(a) && a.includes(b)
    default: return false
  }
}
function compareVals(a, b) {
  if (a === b) return 0
  if (a === undefined || a === null) return -1
  if (b === undefined || b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export async function getDocs(ref) {
  const constraints = ref.__type === 'query' ? ref.constraints : []
  let rows = [...colMap(ref.path).entries()].map(([id, data]) => ({ id, data }))
  for (const c of constraints) if (c.__c === 'where') rows = rows.filter((r) => cmp(norm(getField(r.data, c.field)), c.op, norm(c.value)))
  const obs = constraints.filter((c) => c.__c === 'orderBy')
  for (const o of [...obs].reverse()) rows.sort((a, b) => compareVals(norm(getField(a.data, o.field)), norm(getField(b.data, o.field))) * (o.dir === 'desc' ? -1 : 1))
  const lim = constraints.find((c) => c.__c === 'limit')
  if (lim) rows = rows.slice(0, lim.n)
  const docs = rows.map((r) => qDocSnap(r.id, r.data, ref.converter))
  return { docs, size: docs.length, empty: docs.length === 0, forEach(f) { docs.forEach(f) } }
}
export async function getDoc(ref) { return docSnap(ref.path, ref.converter) }

export async function getCountFromServer(ref) {
  const snap = await getDocs(ref)
  return { data: () => ({ count: snap.size }) }
}

// ── writes + listeners ───────────────────────────────────────────────────────
const subs = []
function notify(colPath, id) { for (const s of subs.slice()) if (s.col === colPath && (s.id === null || s.id === id)) s.fire() }

export async function setDoc(ref, data, opts = {}) {
  const { colPath, id } = split(ref.path); const m = colMap(colPath); const existing = m.get(id)
  const resolved = resolveDeep(data, opts.merge ? existing : undefined)
  m.set(id, opts.merge && existing ? deepMerge(existing, resolved) : resolved)
  notify(colPath, id)
}
export async function addDoc(ref, data) {
  const id = genId(); colMap(ref.path).set(id, resolveDeep(data, undefined)); notify(ref.path, id)
  return makeDoc(ref.path + '/' + id, ref.converter)
}
export async function updateDoc(ref, data) {
  const { colPath, id } = split(ref.path); const m = colMap(colPath); const existing = clone(m.get(id) || {})
  for (const [k, v] of Object.entries(data)) {
    if (k.includes('.')) setPath(existing, k, resolveDeep(v, getField(existing, k)))
    else existing[k] = resolveDeep(v, existing[k])
  }
  m.set(id, existing); notify(colPath, id)
}
export async function deleteDoc(ref) { const { colPath, id } = split(ref.path); colMap(colPath).delete(id); notify(colPath, id) }

export function onSnapshot(ref, onNext, onError) {
  try {
    if (ref.__type === 'doc') {
      const { colPath, id } = split(ref.path)
      const s = { col: colPath, id, fire: () => onNext(docSnap(ref.path, ref.converter)) }
      subs.push(s); Promise.resolve().then(() => s.fire())
      return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1) }
    }
    const s = { col: ref.path, id: null, fire: async () => onNext(await getDocs(ref)) }
    subs.push(s); Promise.resolve().then(() => s.fire())
    return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1) }
  } catch (e) { if (onError) onError(e); return () => {} }
}

export async function runTransaction(_db, fn) {
  const tx = {
    async get(ref) { return docSnap(ref.path, ref.converter) },
    set(ref, data, opts) { return setDoc(ref, data, opts) },
    update(ref, data) { return updateDoc(ref, data) },
    delete(ref) { return deleteDoc(ref) },
  }
  return await fn(tx)
}

export function getFirestore() { return DB }
export function connectFirestoreEmulator() {}

// ── seed the store ───────────────────────────────────────────────────────────
function revive(v) {
  if (v && typeof v === 'object') {
    if (Object.prototype.hasOwnProperty.call(v, '__ts') && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts)
    if (Array.isArray(v)) return v.map(revive)
    const o = {}; for (const [k, val] of Object.entries(v)) o[k] = revive(val); return o
  }
  return v
}
;(function init() {
  const t = seed.tenantId
  colMap('tenants').set(t, revive(seed.tenantDoc))
  for (const [name, docs] of Object.entries(seed.collections)) {
    const cp = `tenants/${t}/${name}`
    for (const [id, data] of Object.entries(docs)) {
      const d = { ...data }; const sub = d.__sub; delete d.__sub
      colMap(cp).set(id, revive(d))
      if (sub) for (const [subName, subDocs] of Object.entries(sub)) { const scp = `${cp}/${id}/${subName}`; for (const [sid, sdata] of Object.entries(subDocs)) colMap(scp).set(sid, revive(sdata)) }
    }
  }
})()
