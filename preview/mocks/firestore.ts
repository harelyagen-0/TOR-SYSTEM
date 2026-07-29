/**
 * In-memory stand-in for firebase/firestore, used only by the artifact preview
 * build (aliased in vite.preview.config.ts). The app's own source is untouched.
 *
 * It implements exactly the surface src/ uses — no more — over a Map of
 * collection path → (docId → data). Reads and writes are synchronous
 * underneath; the async signatures are preserved so the app code is identical.
 *
 * What this CANNOT model is firestore.rules. There is no server here, so
 * permission enforcement is not being demonstrated — only the UI gating that
 * mirrors it. Rules are verified separately by `npm run verify:rules`.
 */

// ── Timestamp ───────────────────────────────────────────────────────────────
export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime() / 1000), (d.getTime() % 1000) * 1e6) }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6) }
  static now() { return Timestamp.fromMillis(Date.now()) }
  toDate() { return new Date(this.toMillis()) }
  toMillis() { return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6) }
  isEqual(o: Timestamp) { return this.toMillis() === o.toMillis() }
}

// ── field sentinels ─────────────────────────────────────────────────────────
const SERVER_TS = Symbol('serverTimestamp')
type Sentinel =
  | { __k: typeof SERVER_TS }
  | { __k: 'increment'; n: number }
  | { __k: 'arrayUnion'; vals: unknown[] }

export const serverTimestamp = () => ({ __k: SERVER_TS }) as Sentinel
export const increment = (n: number) => ({ __k: 'increment', n }) as Sentinel
export const arrayUnion = (...vals: unknown[]) => ({ __k: 'arrayUnion', vals }) as Sentinel
const isSentinel = (v: unknown): v is Sentinel =>
  !!v && typeof v === 'object' && '__k' in (v as Record<string, unknown>)

// ── store ───────────────────────────────────────────────────────────────────
type Doc = Record<string, unknown>
const store = new Map<string, Map<string, Doc>>()
const listeners = new Set<() => void>()

function col(path: string): Map<string, Doc> {
  let c = store.get(path)
  if (!c) { c = new Map(); store.set(path, c) }
  return c
}
function notify() { for (const l of [...listeners]) l() }

let autoId = 0
const newId = () => `gen-${Date.now().toString(36)}-${(autoId++).toString(36)}`

/** Hydrates the store from the JSON dumped out of the seeded emulator. */
export function __hydrate(dump: {
  tenantId: string
  tenant: Doc
  collections: Record<string, Array<{ id: string; data: Doc }>>
}) {
  const revive = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.__ts === 'number') return Timestamp.fromMillis(o.__ts)
      if (Array.isArray(v)) return v.map(revive)
      const out: Doc = {}
      for (const [k, val] of Object.entries(o)) out[k] = revive(val)
      return out
    }
    return v
  }
  col('tenants').set(dump.tenantId, revive(dump.tenant) as Doc)
  for (const [name, docs] of Object.entries(dump.collections)) {
    const c = col(`tenants/${dump.tenantId}/${name}`)
    for (const d of docs) c.set(d.id, revive(d.data) as Doc)
  }
}

// ── refs ────────────────────────────────────────────────────────────────────
interface Converter { toFirestore(v: unknown): Doc; fromFirestore(snap: { id: string; data(): Doc }): unknown }

export interface CollectionReference { __col: string; __conv?: Converter; withConverter(c: Converter): CollectionReference }
export interface DocumentReference { __col: string; __id: string; __conv?: Converter }
export type DocumentData = Doc
export type FirestoreDataConverter<T> = {
  toFirestore(v: T): Doc
  fromFirestore(snap: QueryDocumentSnapshot): T
}
export interface QueryDocumentSnapshot { id: string; data(): Doc }

function makeCol(path: string, conv?: Converter): CollectionReference {
  return {
    __col: path,
    __conv: conv,
    withConverter(c: Converter) { return makeCol(path, c) },
  }
}

export function getFirestore(): unknown { return { __db: true } }
export function connectFirestoreEmulator() { /* no emulator in the preview */ }

export function collection(_db: unknown, ...segs: string[]): CollectionReference {
  return makeCol(segs.join('/'))
}

export function doc(a: unknown, ...rest: string[]): DocumentReference {
  // doc(db, 'tenants', id) | doc(colRef) | doc(colRef, id)
  if (a && typeof a === 'object' && '__col' in (a as CollectionReference)) {
    const c = a as CollectionReference
    return { __col: c.__col, __id: rest[0] ?? newId(), __conv: c.__conv }
  }
  const segs = rest
  const id = segs.pop()!
  return { __col: segs.join('/'), __id: id }
}

// ── queries ─────────────────────────────────────────────────────────────────
type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains'
interface Where { kind: 'where'; field: string; op: Op; value: unknown }
interface Order { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
type Constraint = Where | Order
interface Query { __col: string; __conv?: Converter; __cs: Constraint[] }

export const where = (field: string, op: Op, value: unknown): Where => ({ kind: 'where', field, op, value })
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Order => ({ kind: 'orderBy', field, dir })

export function query(base: CollectionReference | Query, ...cs: Constraint[]): Query {
  const prev = '__cs' in base ? base.__cs : []
  return { __col: base.__col, __conv: base.__conv, __cs: [...prev, ...cs] }
}

const get = (o: Doc, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Doc)[k]), o)

const cmpVal = (v: unknown): number | string => {
  if (v instanceof Timestamp) return v.toMillis()
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  return String(v ?? '')
}

function matches(d: Doc, w: Where): boolean {
  const a = get(d, w.field)
  if (w.op === 'in') return Array.isArray(w.value) && w.value.some((x) => cmpVal(x) === cmpVal(a))
  if (w.op === 'array-contains') return Array.isArray(a) && a.some((x) => cmpVal(x) === cmpVal(w.value))
  const l = cmpVal(a)
  const r = cmpVal(w.value)
  switch (w.op) {
    case '==': return l === r
    case '!=': return l !== r
    case '<': return l < r
    case '<=': return l <= r
    case '>': return l > r
    case '>=': return l >= r
  }
}

function runQuery(q: Query | CollectionReference): Array<{ id: string; data: Doc }> {
  const cs = '__cs' in q ? q.__cs : []
  let rows = [...col(q.__col).entries()].map(([id, data]) => ({ id, data }))
  for (const c of cs) if (c.kind === 'where') rows = rows.filter((r) => matches(r.data, c))
  const orders = cs.filter((c): c is Order => c.kind === 'orderBy')
  for (const o of [...orders].reverse()) {
    rows.sort((x, y) => {
      const a = cmpVal(get(x.data, o.field))
      const b = cmpVal(get(y.data, o.field))
      const n = a < b ? -1 : a > b ? 1 : 0
      return o.dir === 'desc' ? -n : n
    })
  }
  return rows
}

const snapOf = (r: { id: string; data: Doc }, conv?: Converter) => ({
  id: r.id,
  exists: () => true,
  data: () => (conv ? conv.fromFirestore({ id: r.id, data: () => r.data }) : r.data),
})

export async function getDocs(q: Query | CollectionReference) {
  const rows = runQuery(q)
  const conv = q.__conv
  return { docs: rows.map((r) => snapOf(r, conv)), empty: rows.length === 0, size: rows.length }
}

export async function getDoc(ref: DocumentReference) {
  const d = col(ref.__col).get(ref.__id)
  return {
    id: ref.__id,
    exists: () => d !== undefined,
    data: () => (d && ref.__conv ? ref.__conv.fromFirestore({ id: ref.__id, data: () => d }) : d),
  }
}

export async function getCountFromServer(q: Query | CollectionReference) {
  const n = runQuery(q).length
  return { data: () => ({ count: n }) }
}

// ── writes ──────────────────────────────────────────────────────────────────
function resolve(value: unknown, prev: unknown): unknown {
  if (!isSentinel(value)) return value
  if ('__k' in value && value.__k === SERVER_TS) return Timestamp.now()
  const s = value as { __k: string; n?: number; vals?: unknown[] }
  if (s.__k === 'increment') return (typeof prev === 'number' ? prev : 0) + (s.n ?? 0)
  if (s.__k === 'arrayUnion') {
    const base = Array.isArray(prev) ? [...prev] : []
    for (const v of s.vals ?? []) if (!base.some((x) => cmpVal(x) === cmpVal(v))) base.push(v)
    return base
  }
  return value
}

function applyPatch(target: Doc, patch: Doc) {
  for (const [k, v] of Object.entries(patch)) {
    if (k.includes('.')) {
      // dotted field path, e.g. 'stats.totalSpent'
      const parts = k.split('.')
      const last = parts.pop()!
      let node = target
      for (const p of parts) {
        if (typeof node[p] !== 'object' || node[p] === null) node[p] = {}
        node = node[p] as Doc
      }
      node[last] = resolve(v, node[last])
    } else {
      target[k] = resolve(v, target[k])
    }
  }
}

export async function addDoc(ref: CollectionReference, data: Doc) {
  const id = newId()
  const d: Doc = {}
  applyPatch(d, data)
  col(ref.__col).set(id, d)
  notify()
  return { id, __col: ref.__col, __id: id } as DocumentReference & { id: string }
}

export async function setDoc(ref: DocumentReference, data: Doc, opts?: { merge?: boolean }) {
  const c = col(ref.__col)
  const base = opts?.merge ? { ...(c.get(ref.__id) ?? {}) } : {}
  const payload = ref.__conv ? ref.__conv.toFirestore(data) : data
  applyPatch(base, payload)
  c.set(ref.__id, base)
  notify()
}

export async function updateDoc(ref: DocumentReference, data: Doc) {
  const c = col(ref.__col)
  const cur = { ...(c.get(ref.__id) ?? {}) }
  applyPatch(cur, data)
  c.set(ref.__id, cur)
  notify()
}

export async function deleteDoc(ref: DocumentReference) {
  col(ref.__col).delete(ref.__id)
  notify()
}

export async function runTransaction<T>(_db: unknown, fn: (tx: {
  get(ref: DocumentReference): Promise<{ exists(): boolean; data(): Doc | undefined; id: string }>
  set(ref: DocumentReference, data: Doc, opts?: { merge?: boolean }): void
  update(ref: DocumentReference, data: Doc): void
}) => Promise<T>): Promise<T> {
  // single-threaded in the browser, so a direct pass-through is equivalent
  const tx = {
    get: (ref: DocumentReference) => getDoc(ref) as never,
    set: (ref: DocumentReference, data: Doc, opts?: { merge?: boolean }) => { void setDoc(ref, data, opts) },
    update: (ref: DocumentReference, data: Doc) => { void updateDoc(ref, data) },
  }
  const result = await fn(tx)
  notify()
  return result
}

// ── live reads ──────────────────────────────────────────────────────────────
export function onSnapshot(
  target: DocumentReference | Query | CollectionReference,
  onNext: (snap: unknown) => void,
  _onError?: (e: unknown) => void,
) {
  const emit = () => {
    if ('__id' in target) {
      const d = col(target.__col).get(target.__id)
      onNext({ id: target.__id, exists: () => d !== undefined, data: () => d })
    } else {
      const rows = runQuery(target)
      onNext({ docs: rows.map((r) => snapOf(r, target.__conv)), empty: rows.length === 0, size: rows.length })
    }
  }
  emit()
  listeners.add(emit)
  return () => { listeners.delete(emit) }
}

/** Test/preview hook: read a doc synchronously (used by the mock callables). */
export function __raw(path: string) { return col(path) }
export function __notify() { notify() }
