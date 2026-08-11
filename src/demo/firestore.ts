/**
 * In-memory Firestore stand-in for the STANDALONE DEMO build (VITE_DEMO=true).
 *
 * Aliased in place of `firebase/firestore` by vite.config so the whole app runs
 * with no Firebase project, no emulators, and no backend — a self-contained
 * click-through demo. It reimplements exactly the Firestore surface the app
 * uses (collection/doc/query/where/orderBy/getDocs/getDoc/onSnapshot/addDoc/
 * setDoc/updateDoc/deleteDoc/runTransaction/getCountFromServer + Timestamp and
 * the serverTimestamp/increment/arrayUnion field sentinels) plus the two Cloud
 * Function triggers (onPaymentWritten, onExpenseCreated) and the accountant
 * report compiler, so money + schedule invariants behave the same as on the
 * real backend. Nothing here ships in the normal build.
 */
import { seedDemo } from './seed'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>

// ── Timestamp (Firestore-compatible enough for the app + format helpers) ─────
export class Timestamp {
  seconds: number
  nanoseconds: number
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }
  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now())
  }
  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime())
  }
  static fromMillis(ms: number): Timestamp {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6)
  }
  toDate(): Date {
    return new Date(this.toMillis())
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6)
  }
  isEqual(other: Timestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds
  }
  valueOf(): string {
    // lexicographically sortable — lets timestamps compare with < / >
    return String(this.toMillis()).padStart(16, '0')
  }
}

// ── field-value sentinels ────────────────────────────────────────────────────
interface Sentinel {
  __sentinel: 'serverTimestamp' | 'increment' | 'arrayUnion'
  by?: number
  values?: any[]
}
function isSentinel(v: any): v is Sentinel {
  return !!v && typeof v === 'object' && '__sentinel' in v
}
export function serverTimestamp(): Sentinel {
  return { __sentinel: 'serverTimestamp' }
}
export function increment(by: number): Sentinel {
  return { __sentinel: 'increment', by }
}
export function arrayUnion(...values: any[]): Sentinel {
  return { __sentinel: 'arrayUnion', values }
}

// ── references + query descriptor ────────────────────────────────────────────
type Converter = {
  fromFirestore: (snap: { id: string; data: () => Doc }) => any
  toFirestore: (value: any) => Doc
}

export class CollectionReference {
  path: string
  converter: Converter | null
  constructor(path: string, converter: Converter | null = null) {
    this.path = path
    this.converter = converter
  }
  withConverter(converter: Converter): CollectionReference {
    return new CollectionReference(this.path, converter)
  }
}

export class DocumentReference {
  path: string
  constructor(path: string) {
    this.path = path
  }
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1)
  }
}

interface WhereClause {
  type: 'where'
  field: string
  op: string
  value: any
}
interface OrderClause {
  type: 'orderBy'
  field: string
  dir: 'asc' | 'desc'
}
type Constraint = WhereClause | OrderClause

export class Query {
  path: string
  converter: Converter | null
  wheres: WhereClause[]
  orders: OrderClause[]
  constructor(path: string, converter: Converter | null, wheres: WhereClause[], orders: OrderClause[]) {
    this.path = path
    this.converter = converter
    this.wheres = wheres
    this.orders = orders
  }
}

// ── the store ────────────────────────────────────────────────────────────────
const collections = new Map<string, Map<string, Doc>>()
let idSeq = 0

function colMap(path: string): Map<string, Doc> {
  let m = collections.get(path)
  if (!m) {
    m = new Map()
    collections.set(path, m)
  }
  return m
}
function splitDoc(docPath: string): [string, string] {
  const i = docPath.lastIndexOf('/')
  return [docPath.slice(0, i), docPath.slice(i + 1)]
}
export function readDoc(docPath: string): Doc | undefined {
  const [col, id] = splitDoc(docPath)
  return collections.get(col)?.get(id)
}
/** Seed-only writer: stores a fully-resolved doc without firing triggers. */
export function setRaw(docPath: string, data: Doc): void {
  const [col, id] = splitDoc(docPath)
  colMap(col).set(id, data)
}

let seeded = false
export function ensureSeeded(): void {
  if (seeded) return
  seeded = true
  seedDemo()
}

// ── change listeners (power onSnapshot) ──────────────────────────────────────
type Listener =
  | { kind: 'doc'; path: string; fire: () => void }
  | { kind: 'query'; colPath: string; fire: () => void }
const listeners = new Set<Listener>()

function notify(docPath: string): void {
  const [colPath] = splitDoc(docPath)
  for (const l of [...listeners]) {
    if (l.kind === 'doc' && l.path === docPath) l.fire()
    else if (l.kind === 'query' && l.colPath === colPath) l.fire()
  }
}

// ── value helpers ────────────────────────────────────────────────────────────
function clone<T>(v: T): T {
  if (v instanceof Timestamp) return v
  if (Array.isArray(v)) return v.map(clone) as unknown as T
  if (v && typeof v === 'object') {
    const out: Doc = {}
    for (const k in v as Doc) out[k] = clone((v as Doc)[k])
    return out as T
  }
  return v
}
function getPath(obj: Doc | undefined, path: string): any {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
function setPath(obj: Doc, path: string, value: any): void {
  const keys = path.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {}
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
}
function resolve(value: any, base: any): any {
  if (isSentinel(value)) {
    if (value.__sentinel === 'serverTimestamp') return Timestamp.now()
    if (value.__sentinel === 'increment') return (typeof base === 'number' ? base : 0) + (value.by ?? 0)
    if (value.__sentinel === 'arrayUnion') {
      const arr = Array.isArray(base) ? [...base] : []
      for (const v of value.values ?? []) if (!arr.some((e) => e === v)) arr.push(v)
      return arr
    }
  }
  return value
}
function normalizeCreate(input: Doc): Doc {
  const out: Doc = {}
  for (const k in input) out[k] = resolve(input[k], undefined)
  return out
}
function mergeInto(before: Doc | undefined, input: Doc): Doc {
  const out = before ? clone(before) : {}
  for (const k in input) out[k] = resolve(input[k], before?.[k])
  return out
}
function updateInto(before: Doc, input: Doc): Doc {
  const out = clone(before)
  for (const k in input) {
    if (k.includes('.')) setPath(out, k, resolve(input[k], getPath(out, k)))
    else out[k] = resolve(input[k], before[k])
  }
  return out
}

type WriteMode = 'create' | 'merge' | 'update'
function writeDoc(docPath: string, input: Doc, mode: WriteMode): void {
  const [colPath, id] = splitDoc(docPath)
  const m = colMap(colPath)
  const before = m.get(id)
  let next: Doc
  if (mode === 'update') next = updateInto(before ?? {}, input)
  else if (mode === 'merge') next = mergeInto(before, input)
  else next = normalizeCreate(input)
  m.set(id, next)
  notify(docPath)
  dispatchTrigger(colPath, id, before, next)
}

// ── comparison + filtering ───────────────────────────────────────────────────
function comparable(v: any): any {
  return v instanceof Timestamp ? v.toMillis() : v
}
function cmp(a: any, b: any): number {
  const x = comparable(a)
  const y = comparable(b)
  if (x == null && y == null) return 0
  if (x == null) return -1
  if (y == null) return 1
  if (typeof x === 'number' && typeof y === 'number') return x - y
  const sx = String(x)
  const sy = String(y)
  return sx < sy ? -1 : sx > sy ? 1 : 0
}
function matchWhere(a: any, op: string, b: any): boolean {
  switch (op) {
    case '==':
      if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() === b.toMillis()
      return a === b
    case '!=':
      return a !== b
    case '>=':
      return cmp(a, b) >= 0
    case '>':
      return cmp(a, b) > 0
    case '<=':
      return cmp(a, b) <= 0
    case '<':
      return cmp(a, b) < 0
    case 'in':
      return Array.isArray(b) && b.includes(a)
    case 'array-contains':
      return Array.isArray(a) && a.includes(b)
    default:
      return false
  }
}

function normQuery(q: CollectionReference | Query): {
  path: string
  converter: Converter | null
  wheres: WhereClause[]
  orders: OrderClause[]
} {
  if (q instanceof Query) return { path: q.path, converter: q.converter, wheres: q.wheres, orders: q.orders }
  return { path: q.path, converter: q.converter, wheres: [], orders: [] }
}

function makeQueryDocSnapshot(id: string, raw: Doc, converter: Converter | null) {
  return {
    id,
    exists: () => true,
    data: () => (converter ? converter.fromFirestore({ id, data: () => raw }) : raw),
  }
}

// ── public Firestore API ─────────────────────────────────────────────────────
const DB = { __demoFirestore: true }

export function getFirestore(): typeof DB {
  ensureSeeded()
  return DB
}
export function connectFirestoreEmulator(): void {
  /* no-op in demo */
}

export function collection(_db: unknown, ...segments: string[]): CollectionReference {
  return new CollectionReference(segments.join('/'))
}

export function doc(a: unknown, ...rest: string[]): DocumentReference {
  if (a instanceof CollectionReference) {
    const id = rest[0] ?? `d${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 8)}`
    return new DocumentReference(`${a.path}/${id}`)
  }
  // doc(db, ...pathSegments)
  return new DocumentReference(rest.join('/'))
}

export function where(field: string, op: string, value: any): WhereClause {
  return { type: 'where', field, op, value }
}
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): OrderClause {
  return { type: 'orderBy', field, dir }
}
export function query(base: CollectionReference | Query, ...constraints: Constraint[]): Query {
  const start = normQuery(base)
  const wheres = [...start.wheres]
  const orders = [...start.orders]
  for (const c of constraints) {
    if (c.type === 'where') wheres.push(c)
    else orders.push(c)
  }
  return new Query(start.path, start.converter, wheres, orders)
}

function evaluate(q: CollectionReference | Query) {
  const { path, converter, wheres, orders } = normQuery(q)
  const m = collections.get(path) ?? new Map<string, Doc>()
  let rows = [...m.entries()].map(([id, d]) => ({ id, d }))
  for (const w of wheres) rows = rows.filter((r) => matchWhere(getPath(r.d, w.field), w.op, w.value))
  if (orders.length) {
    rows.sort((a, b) => {
      for (const o of orders) {
        const c = cmp(getPath(a.d, o.field), getPath(b.d, o.field)) * (o.dir === 'desc' ? -1 : 1)
        if (c !== 0) return c
      }
      return 0
    })
  }
  return rows.map((r) => makeQueryDocSnapshot(r.id, r.d, converter))
}

export async function getDocs(q: CollectionReference | Query) {
  ensureSeeded()
  const docs = evaluate(q)
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: any) => void) => docs.forEach(fn) }
}

export async function getDoc(ref: DocumentReference) {
  ensureSeeded()
  const data = readDoc(ref.path)
  return { id: ref.id, exists: () => data !== undefined, data: () => data }
}

export async function getCountFromServer(q: CollectionReference | Query) {
  ensureSeeded()
  const docs = evaluate(q)
  return { data: () => ({ count: docs.length }) }
}

export function onSnapshot(
  target: DocumentReference | CollectionReference | Query,
  onNext: (snap: any) => void,
  _onError?: (err: unknown) => void,
): () => void {
  ensureSeeded()
  if (target instanceof DocumentReference) {
    const fire = () => {
      const data = readDoc(target.path)
      onNext({ id: target.id, exists: () => data !== undefined, data: () => data })
    }
    const l: Listener = { kind: 'doc', path: target.path, fire }
    listeners.add(l)
    fire()
    return () => listeners.delete(l)
  }
  const { path } = normQuery(target)
  const fire = () => {
    const docs = evaluate(target)
    onNext({ docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: any) => void) => docs.forEach(fn) })
  }
  const l: Listener = { kind: 'query', colPath: path, fire }
  listeners.add(l)
  fire()
  return () => listeners.delete(l)
}

export async function addDoc(colRef: CollectionReference, data: Doc): Promise<DocumentReference> {
  const ref = doc(colRef)
  writeDoc(ref.path, data, 'create')
  return ref
}
export async function setDoc(ref: DocumentReference, data: Doc, options?: { merge?: boolean }): Promise<void> {
  writeDoc(ref.path, data, options?.merge ? 'merge' : 'create')
}
export async function updateDoc(ref: DocumentReference, data: Doc): Promise<void> {
  if (readDoc(ref.path) === undefined) throw new Error(`No document to update: ${ref.path}`)
  writeDoc(ref.path, data, 'update')
}
export async function deleteDoc(ref: DocumentReference): Promise<void> {
  const [col, id] = splitDoc(ref.path)
  collections.get(col)?.delete(id)
  notify(ref.path)
}

export async function runTransaction<T>(_db: unknown, fn: (tx: any) => Promise<T>): Promise<T> {
  const tx = {
    get: async (ref: DocumentReference) => {
      const data = readDoc(ref.path)
      return { id: ref.id, exists: () => data !== undefined, data: () => data }
    },
    set: (ref: DocumentReference, data: Doc, options?: { merge?: boolean }) =>
      writeDoc(ref.path, data, options?.merge ? 'merge' : 'create'),
    update: (ref: DocumentReference, data: Doc) => writeDoc(ref.path, data, 'update'),
    delete: (ref: DocumentReference) => {
      const [col, id] = splitDoc(ref.path)
      collections.get(col)?.delete(id)
      notify(ref.path)
    },
  }
  return await fn(tx)
}

// ── Cloud Function trigger replicas ──────────────────────────────────────────
function tenantTz(tenantId: string): string {
  return (readDoc(`tenants/${tenantId}`)?.timezone as string) ?? 'Asia/Jerusalem'
}
function monthKeyOf(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month').padStart(2, '0')}`
}

function issueMockInvoice(tenantId: string, paymentId: string, amount: number, kind: 'invoice' | 'creditInvoice') {
  const counterPath = `tenants/${tenantId}/counters/invoices`
  const next = (readDoc(counterPath)?.next as number) ?? 1
  writeDoc(counterPath, { next: next + 1 }, 'merge')
  const number = `${new Date().getFullYear()}-${String(next).padStart(4, '0')}${kind === 'creditInvoice' ? 'C' : ''}`
  const invoiceId = `inv-${number}`
  writeDoc(
    `tenants/${tenantId}/invoices/${invoiceId}`,
    { number, paymentId, amount, kind, createdAt: serverTimestamp(), fileUrl: null },
    'create',
  )
  return { invoiceId, number }
}

function dispatchTrigger(colPath: string, id: string, before: Doc | undefined, after: Doc): void {
  const parts = colPath.split('/')
  if (parts.length !== 3 || parts[0] !== 'tenants') return
  const tenantId = parts[1]
  const col = parts[2]
  if (col === 'payments') {
    const beforeSnapshot = before ? clone(before) : undefined
    setTimeout(() => runPaymentTrigger(tenantId, id, beforeSnapshot, after), 140)
  } else if (col === 'expenses' && before === undefined) {
    setTimeout(() => runExpenseTrigger(tenantId, id), 80)
  }
}

function runPaymentTrigger(tenantId: string, paymentId: string, before: Doc | undefined, _after: Doc): void {
  const after = readDoc(`tenants/${tenantId}/payments/${paymentId}`)
  if (!after) return
  const tz = tenantTz(tenantId)
  const p = (n: string) => `tenants/${tenantId}/${n}`

  // A) a refund doc (negative amount referencing an original)
  if (after.refundOfPaymentId && after.amount < 0 && !before) {
    if (!after.invoiceId) {
      const { invoiceId } = issueMockInvoice(tenantId, paymentId, after.amount, 'creditInvoice')
      writeDoc(`${p('payments')}/${paymentId}`, { invoiceId, status: 'refunded' }, 'update')
      writeDoc(`${p('payments')}/${after.refundOfPaymentId}`, { status: 'refunded' }, 'update')
      writeDoc(
        `${p('ledger')}/led_${paymentId}`,
        {
          kind: 'refund',
          amount: after.amount,
          description: `זיכוי — ${after.productSnapshot?.name ?? ''}`,
          refId: paymentId,
          invoiceId,
          period: monthKeyOf(new Date(), tz),
          createdAt: serverTimestamp(),
        },
        'create',
      )
    }
    return
  }

  // B) a payment transitioning to paid
  const becamePaid = after.status === 'paid' && before?.status !== 'paid'
  if (!becamePaid || after.amount <= 0) return
  if (after.invoiceId) return

  const { invoiceId } = issueMockInvoice(tenantId, paymentId, after.amount, 'invoice')
  writeDoc(`${p('payments')}/${paymentId}`, { invoiceId }, 'update')

  const items: Array<{ productId: string; name: string; kind: string; quantity: number }> =
    Array.isArray(after.items) && after.items.length > 0
      ? after.items
      : [{ productId: after.productId, name: after.productSnapshot?.name ?? '', kind: after.productSnapshot?.kind, quantity: 1 }]

  const summary = items.map((l) => (l.quantity > 1 ? `${l.name} ×${l.quantity}` : l.name)).join(', ')
  writeDoc(
    `${p('ledger')}/led_${paymentId}`,
    {
      kind: 'payment',
      amount: after.amount,
      description: `${summary}${after.walkInName ? ` — ${after.walkInName}` : ''}`,
      refId: paymentId,
      invoiceId,
      period: monthKeyOf(new Date(), tz),
      createdAt: serverTimestamp(),
    },
    'create',
  )

  if (after.customerId) {
    for (let li = 0; li < items.length; li++) {
      const line = items[li]
      if (line.kind !== 'punchCard' && line.kind !== 'subscription') continue
      const product = readDoc(`${p('products')}/${line.productId}`)
      for (let u = 0; u < line.quantity; u++) {
        if (line.kind === 'punchCard') {
          writeDoc(
            `${p('entitlements')}/ent_${paymentId}_${li}_${u}`,
            {
              customerId: after.customerId,
              productId: line.productId,
              kind: 'punchCard',
              remaining: product?.punchCount ?? 0,
              expiresAt: Timestamp.fromMillis(Date.now() + 365 * 86400_000),
              status: 'active',
              createdAt: serverTimestamp(),
            },
            'create',
          )
        } else {
          const intervalDays = (product?.intervalDays as number) ?? 30
          writeDoc(
            `${p('subscriptions')}/sub_${paymentId}_${li}_${u}`,
            {
              customerId: after.customerId,
              productId: line.productId,
              productSnapshot: { name: line.name, price: product?.price ?? 0 },
              startedAt: serverTimestamp(),
              intervalDays,
              nextChargeAt: Timestamp.fromMillis(Date.now() + intervalDays * 86400_000),
              endsAt: null,
              status: 'active',
              growTokenRef: after.growTransactionId ?? null,
            },
            'create',
          )
        }
      }
    }
  }

  if (after.customerId) {
    writeDoc(`${p('customers')}/${after.customerId}`, { 'stats.totalSpent': increment(after.amount) }, 'update')
  }
}

function runExpenseTrigger(tenantId: string, expenseId: string): void {
  const data = readDoc(`tenants/${tenantId}/expenses/${expenseId}`)
  if (!data) return
  const tz = tenantTz(tenantId)
  const when = data.date instanceof Timestamp ? data.date.toDate() : new Date()
  writeDoc(
    `tenants/${tenantId}/ledger/led_${expenseId}`,
    {
      kind: 'expense',
      amount: -Math.abs(data.amount as number),
      description: data.name ?? '',
      refId: expenseId,
      invoiceId: null,
      period: monthKeyOf(when, tz),
      createdAt: serverTimestamp(),
    },
    'create',
  )
}

/** Used by the demo `resendReport` callable — compiles the period's ledger. */
export function compileAndSendReport(tenantId: string, period: string): void {
  const m = collections.get(`tenants/${tenantId}/ledger`) ?? new Map<string, Doc>()
  let income = 0
  let expenses = 0
  let refunds = 0
  const lineItems: Doc[] = []
  for (const [, l] of m) {
    if (l.period !== period) continue
    lineItems.push(l)
    if (l.kind === 'payment') income += l.amount
    else if (l.kind === 'expense') expenses += -l.amount
    else if (l.kind === 'refund') refunds += l.amount
  }
  writeDoc(
    `tenants/${tenantId}/reports/${period}`,
    {
      period,
      totals: { income, expenses, refunds, net: income + refunds - expenses },
      lineItems,
      fileUrl: null,
      sentAt: serverTimestamp(),
    },
    'create',
  )
}
