/**
 * `firebase/firestore` stand-in for the preview build. Implements the exact
 * surface the app uses; everything is backed by the in-memory store.
 */
import {
  Timestamp, genId, rawGet, rawAll, writeDoc, deleteDoc as storeDelete,
  onDocChange, onColChange, serverTimestamp, increment, arrayUnion,
} from './store'

export { Timestamp, serverTimestamp, increment, arrayUnion }

type Converter<T> = {
  toFirestore: (v: T) => Record<string, unknown>
  fromFirestore: (snap: { id: string; data: () => Record<string, unknown> }) => T
}
interface ColRef {
  __t: 'col'
  path: string
  converter?: Converter<unknown>
  withConverter: (c: Converter<unknown>) => ColRef
}
interface DocRef {
  __t: 'doc'
  path: string
  id: string
  converter?: Converter<unknown>
}
type WhereC = { t: 'where'; field: string; op: string; value: unknown }
type OrderC = { t: 'orderBy'; field: string; dir: 'asc' | 'desc' }
type LimitC = { t: 'limit'; n: number }
type Constraint = WhereC | OrderC | LimitC
interface QueryRef { __t: 'query'; col: ColRef; constraints: Constraint[] }

const DB = { __db: true as const }
export function getFirestore() { return DB }
export function connectFirestoreEmulator() { /* no-op in preview */ }

function makeCol(path: string, converter?: Converter<unknown>): ColRef {
  return {
    __t: 'col', path, converter,
    withConverter: (c) => makeCol(path, c),
  }
}

export function collection(_db: unknown, ...segs: string[]): ColRef {
  return makeCol(segs.join('/'))
}

export function doc(parent: ColRef | DocRef | typeof DB, ...rest: string[]): DocRef {
  if ((parent as ColRef).__t === 'col') {
    const col = parent as ColRef
    return { __t: 'doc', path: col.path, id: rest[0] ?? genId(), converter: col.converter }
  }
  // doc(db, 'tenants', tenantId, ...) — path segments after the db handle
  const segs = rest
  const id = segs[segs.length - 1]
  const path = segs.slice(0, -1).join('/')
  return { __t: 'doc', path, id }
}

export function query(col: ColRef, ...constraints: Constraint[]): QueryRef {
  return { __t: 'query', col, constraints }
}
export function where(field: string, op: string, value: unknown): WhereC {
  return { t: 'where', field, op, value }
}
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): OrderC {
  return { t: 'orderBy', field, dir }
}
export function limit(n: number): LimitC {
  return { t: 'limit', n }
}

// ── comparison helpers ───────────────────────────────────────────────────────
function comparable(v: unknown): number | string | boolean | null {
  if (v instanceof Timestamp) return v.toMillis()
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  return String(v)
}
function cmp(a: unknown, b: unknown): number {
  const ca = comparable(a)
  const cb = comparable(b)
  if (ca == null && cb == null) return 0
  if (ca == null) return -1
  if (cb == null) return 1
  if (ca < cb) return -1
  if (ca > cb) return 1
  return 0
}
function testWhere(fieldVal: unknown, op: string, value: unknown): boolean {
  switch (op) {
    case '==': return cmp(fieldVal, value) === 0
    case '!=': return cmp(fieldVal, value) !== 0
    case '>': return fieldVal !== undefined && cmp(fieldVal, value) > 0
    case '>=': return fieldVal !== undefined && cmp(fieldVal, value) >= 0
    case '<': return fieldVal !== undefined && cmp(fieldVal, value) < 0
    case '<=': return fieldVal !== undefined && cmp(fieldVal, value) <= 0
    case 'in': return Array.isArray(value) && value.some((v) => cmp(fieldVal, v) === 0)
    case 'array-contains': return Array.isArray(fieldVal) && fieldVal.some((v) => cmp(v, value) === 0)
    default: return false
  }
}

interface Row { id: string; data: Record<string, unknown> }

function runQuery(q: QueryRef | ColRef): { col: ColRef; rows: Row[] } {
  const col = q.__t === 'query' ? q.col : q
  const constraints = q.__t === 'query' ? q.constraints : []
  let rows: Row[] = rawAll(col.path)
  for (const c of constraints) {
    if (c.t === 'where') rows = rows.filter((r) => testWhere(r.data[c.field], c.op, c.value))
  }
  const orders = constraints.filter((c): c is OrderC => c.t === 'orderBy')
  if (orders.length) {
    rows = [...rows].sort((a, b) => {
      for (const o of orders) {
        const d = cmp(a.data[o.field], b.data[o.field])
        if (d !== 0) return o.dir === 'desc' ? -d : d
      }
      return 0
    })
  }
  const lim = constraints.find((c): c is LimitC => c.t === 'limit')
  if (lim) rows = rows.slice(0, lim.n)
  return { col, rows }
}

// ── snapshots ────────────────────────────────────────────────────────────────
function makeDocSnap(ref: DocRef, data: Record<string, unknown> | undefined) {
  return {
    id: ref.id,
    ref,
    exists: () => data !== undefined,
    data: () => {
      if (data === undefined) return undefined
      if (ref.converter) return ref.converter.fromFirestore({ id: ref.id, data: () => data })
      return data
    },
  }
}
function makeRowSnap(col: ColRef, row: Row) {
  const ref: DocRef = { __t: 'doc', path: col.path, id: row.id, converter: col.converter }
  return makeDocSnap(ref, row.data)
}
function makeQuerySnap(col: ColRef, rows: Row[]) {
  const docs = rows.map((r) => makeRowSnap(col, r))
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb: (d: (typeof docs)[number]) => void) => docs.forEach(cb),
  }
}

// simulate async so react-query behaves like it does against Firestore
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export async function getDoc(ref: DocRef) {
  await tick()
  return makeDocSnap(ref, rawGet(ref.path, ref.id))
}
export async function getDocs(q: QueryRef | ColRef) {
  await tick()
  const { col, rows } = runQuery(q)
  return makeQuerySnap(col, rows)
}
export async function getCountFromServer(q: QueryRef | ColRef) {
  await tick()
  const { rows } = runQuery(q)
  return { data: () => ({ count: rows.length }) }
}

export function onSnapshot(
  target: DocRef | QueryRef | ColRef,
  next: (snap: unknown) => void,
  _error?: (e: unknown) => void,
): () => void {
  if ((target as DocRef).__t === 'doc') {
    const ref = target as DocRef
    const emit = () => next(makeDocSnap(ref, rawGet(ref.path, ref.id)))
    const unsub = onDocChange(ref.path, ref.id, emit)
    emit()
    return unsub
  }
  const col = (target as QueryRef).__t === 'query' ? (target as QueryRef).col : (target as ColRef)
  const emit = () => {
    const { rows } = runQuery(target as QueryRef | ColRef)
    next(makeQuerySnap(col, rows))
  }
  const unsub = onColChange(col.path, emit)
  emit()
  return unsub
}

// ── writes ───────────────────────────────────────────────────────────────────
export async function addDoc(col: ColRef, data: Record<string, unknown>) {
  await tick()
  const id = genId()
  writeDoc(col.path, id, data, false)
  return { __t: 'doc', path: col.path, id } as DocRef
}
export async function setDoc(ref: DocRef, data: Record<string, unknown>, opts?: { merge?: boolean }) {
  await tick()
  writeDoc(ref.path, ref.id, data, opts?.merge === true)
}
export async function updateDoc(ref: DocRef, data: Record<string, unknown>) {
  await tick()
  writeDoc(ref.path, ref.id, data, true)
}
export async function deleteDoc(ref: DocRef) {
  await tick()
  storeDelete(ref.path, ref.id)
}

// ── transactions ─────────────────────────────────────────────────────────────
interface TxWrite { ref: DocRef; data: Record<string, unknown>; merge: boolean }
export async function runTransaction<T>(_db: unknown, fn: (tx: {
  get: (ref: DocRef) => Promise<ReturnType<typeof makeDocSnap>>
  set: (ref: DocRef, data: Record<string, unknown>, opts?: { merge?: boolean }) => void
  update: (ref: DocRef, data: Record<string, unknown>) => void
}) => Promise<T>): Promise<T> {
  const writes: TxWrite[] = []
  const tx = {
    get: async (ref: DocRef) => makeDocSnap(ref, rawGet(ref.path, ref.id)),
    set: (ref: DocRef, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
      { writes.push({ ref, data, merge: opts?.merge === true }) },
    update: (ref: DocRef, data: Record<string, unknown>) =>
      { writes.push({ ref, data, merge: true }) },
  }
  const result = await fn(tx)
  for (const w of writes) writeDoc(w.ref.path, w.ref.id, w.data, w.merge)
  return result
}
