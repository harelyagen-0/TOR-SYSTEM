/**
 * Demo dataset for the STANDALONE DEMO build — a faithful port of
 * scripts/seed.mjs into the in-memory store. Same tenant (סטודיו גל), same
 * catalogue, customers, schedule, payments, ledger and subscriptions, so the
 * click-through demo shows realistic, self-consistent numbers.
 *
 * Hebrew literals here are tenant DATA (a studio's own content), not UI strings.
 */
import { setRaw, Timestamp } from './firestore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TENANT_ID = 'demo-yoga'
const TZ = 'Asia/Jerusalem'
const UID = 'demo-operator'

// ── timezone helpers (mirror src/lib/format.ts) ──────────────────────────────
function tzParts(d: Date, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: +get('year'), month: +get('month'), day: +get('day'),
    hour: +get('hour'), minute: +get('minute'),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  }
}
function utcFromParts(d: Date, tz: string): number {
  const p = tzParts(d, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}
function zonedTimeToUtc(ymd: string, hm: string, tz = TZ): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const guess = wall - (utcFromParts(new Date(wall), tz) - wall)
  const offset = utcFromParts(new Date(guess), tz) - guess
  return new Date(wall - offset)
}
function dateKeyOf(d: Date, tz = TZ): string {
  const p = tzParts(d, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
function addDaysKey(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const b = new Date(Date.UTC(y, m - 1, d))
  b.setUTCDate(b.getUTCDate() + n)
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`
}
const monthKeyOf = (d: Date) => dateKeyOf(d).slice(0, 7)
const ts = (date: Date) => Timestamp.fromDate(date)
const daysAgo = (n: number, hm = '10:00') => zonedTimeToUtc(addDaysKey(dateKeyOf(new Date()), -n), hm)

const set = (collection: string, id: string, data: any) => setRaw(`tenants/${TENANT_ID}/${collection}/${id}`, data)

export function seedDemo(): void {
  // ── tenant config ──────────────────────────────────────────────────────────
  setRaw(`tenants/${TENANT_ID}`, {
    name: 'סטודיו גל',
    logoUrl: null,
    timezone: TZ,
    currency: 'ILS',
    locale: 'he-IL',
    theme: { primary: '#0070f3', accent: '#0070f3', surface: '#ffffff', text: '#0b0f1a' },
    classTypes: [
      { id: 'yoga', labelHe: 'יוגה', color: '#0ea5e9' },
      { id: 'pilates', labelHe: 'פילאטיס', color: '#8b5cf6' },
      { id: 'meditation', labelHe: 'מדיטציה', color: '#10b981' },
    ],
    accountant: { name: 'רו״ח רות אלון', email: 'cpa@example.co.il' },
    integrations: { grow: null, invoicing: null, whatsapp: null },
  })

  // ── instructors ────────────────────────────────────────────────────────────
  const instructors = [
    { id: 'inst-gal', firstName: 'גל', lastName: 'ברק', experience: 'מורה ליוגה 12 שנים, מוסמכת ויניאסה ואשטנגה', allowedClassTypes: ['yoga', 'meditation'], phone: '050-1112233', color: '#0ea5e9', active: true },
    { id: 'inst-noa', firstName: 'נועה', lastName: 'שגב', experience: 'מדריכת פילאטיס מכשירים ומזרן', allowedClassTypes: ['pilates', 'yoga'], phone: '052-4445566', color: '#8b5cf6', active: true },
    { id: 'inst-omer', firstName: 'עומר', lastName: 'דגן', experience: 'יוגה תרפיה', allowedClassTypes: ['yoga'], phone: '054-7778899', color: '#f59e0b', active: true },
  ]
  for (const i of instructors) { const { id, ...rest } = i; set('instructors', id, rest) }

  // ── products ───────────────────────────────────────────────────────────────
  const products: any[] = [
    { id: 'prod-single', name: 'כניסה בודדת ליוגה', description: 'שיעור אחד, כל סוגי היוגה', price: 50, kind: 'single', allowedClassTypes: ['yoga'], active: true },
    { id: 'prod-punch10', name: 'כרטיסייה 10 כניסות', description: 'בתוקף לשנה מרגע הרכישה', price: 450, kind: 'punchCard', punchCount: 10, allowedClassTypes: [], active: true },
    { id: 'prod-sub-yoga', name: 'מנוי חודשי — יוגה', description: 'ללא הגבלת כניסות לשיעורי יוגה', price: 300, kind: 'subscription', intervalDays: 30, allowedClassTypes: ['yoga', 'meditation'], active: true },
    { id: 'prod-sub-studio', name: 'מנוי חודשי — סטודיו + פילאטיס', description: 'כל השיעורים כולל פילאטיס מכשירים', price: 380, kind: 'subscription', intervalDays: 30, allowedClassTypes: [], active: true },
  ]
  for (const prod of products) { const { id, ...rest } = prod; set('products', id, { ...rest, createdAt: ts(daysAgo(90)) }) }
  const prodById: Record<string, any> = Object.fromEntries(products.map((p) => [p.id, p]))
  const PRICE_SINGLE = prodById['prod-single'].price

  // ── customer scenarios ───────────────────────────────────────────────────
  const customerDefs: any[] = [
    { id: 'cust-1', firstName: 'נועה', lastName: 'כהן', phone: '0501234567', email: 'noa@example.com',
      buys: [['prod-sub-yoga', 62, 'card'], ['prod-sub-yoga', 32, 'card'], ['prod-sub-yoga', 2, 'card']], attends: 22,
      events: [{ status: 'noShow' }] },
    { id: 'cust-2', firstName: 'איתי', lastName: 'לוי', phone: '0529876543', email: 'itay@example.com',
      buys: [['prod-punch10', 30, 'cash']], attends: 3,
      events: [{ status: 'cancelled', late: false }] },
    { id: 'cust-3', firstName: 'שירה', lastName: 'מזרחי', phone: '0533334444', email: 'shira@example.com',
      buys: [['prod-sub-studio', 36, 'card'], ['prod-sub-studio', 6, 'card']], attends: 15 },
    { id: 'cust-4', firstName: 'עומר', lastName: 'בן־דוד', phone: '0545556677', email: '',
      buys: [
        ['prod-single', 14, 'other', { otherLabel: 'ביט' }],
        ['prod-single', 9, 'other', { otherLabel: 'ביט' }],
        ['prod-single', 4, 'cash'],
        ['prod-single', 1, 'other', { otherLabel: 'ביט', refunded: true }],
      ], attends: 3,
      events: [{ status: 'cancelled', late: false }, { status: 'cancelled', late: true, charged: true }] },
    { id: 'cust-5', firstName: 'דנה', lastName: 'פרץ', phone: '0587771122', email: 'dana@example.com',
      buys: [
        ['prod-sub-yoga', 64, 'card'], ['prod-sub-yoga', 34, 'card'],
        ['prod-sub-yoga', 4, 'card'], ['prod-sub-yoga', 0, 'card', { status: 'pending' }],
      ], attends: 18 },
    { id: 'cust-6', firstName: 'יעל', lastName: 'אשכנזי', phone: '0509990011', email: '',
      buys: [['prod-sub-yoga', 95, 'card']], attends: 6 },
    { id: 'cust-7', firstName: 'רוני', lastName: 'הדר', phone: '0523216549', email: 'roni@example.com',
      buys: [['prod-punch10', 40, 'card'], ['prod-single', 12, 'cash'], ['prod-single', 4, 'card']], attends: 12 },
    { id: 'cust-8', firstName: 'מאיה', lastName: 'אלון', phone: '0546601234', email: '',
      buys: [['prod-single', 14, 'cash']], attends: 1 },
  ]

  // ── templates + recurrences ──────────────────────────────────────────────
  const templates: any[] = [
    { id: 'tpl-vinyasa', title: 'ויניאסה בוקר', classTypeId: 'yoga', defaultInstructorId: 'inst-gal', capacity: 12, durationMinutes: 60, price: 50, defaultStartTime: '08:00', room: 'אולם ראשי' },
    { id: 'tpl-pilates', title: 'פילאטיס מכשירים', classTypeId: 'pilates', defaultInstructorId: 'inst-noa', capacity: 8, durationMinutes: 55, price: 70, defaultStartTime: '10:00', room: 'חדר מכשירים' },
    { id: 'tpl-evening', title: 'יוגה ערב', classTypeId: 'yoga', defaultInstructorId: 'inst-omer', capacity: 14, durationMinutes: 75, price: 50, defaultStartTime: '18:30', room: 'אולם ראשי' },
    { id: 'tpl-medit', title: 'מדיטציה מודרכת', classTypeId: 'meditation', defaultInstructorId: 'inst-gal', capacity: 16, durationMinutes: 45, price: 40, defaultStartTime: '19:45', room: 'אולם קטן', allowedProductIds: ['prod-sub-studio'] },
  ]
  for (const t of templates) { const { id, ...rest } = t; set('classTemplates', id, rest) }

  const todayKey = dateKeyOf(new Date())
  const recStart = addDaysKey(todayKey, -70)
  const recurrences: any[] = [
    { id: 'rec-vin-sun', templateId: 'tpl-vinyasa', weekday: 0, time: '08:00' },
    { id: 'rec-vin-wed', templateId: 'tpl-vinyasa', weekday: 3, time: '08:00' },
    { id: 'rec-pil-mon', templateId: 'tpl-pilates', weekday: 1, time: '10:00' },
    { id: 'rec-pil-thu', templateId: 'tpl-pilates', weekday: 4, time: '10:00' },
    { id: 'rec-eve-sun', templateId: 'tpl-evening', weekday: 0, time: '18:30' },
    { id: 'rec-eve-tue', templateId: 'tpl-evening', weekday: 2, time: '18:30' },
    { id: 'rec-eve-thu', templateId: 'tpl-evening', weekday: 4, time: '18:30' },
    { id: 'rec-med-thu', templateId: 'tpl-medit', weekday: 4, time: '19:45' },
  ]
  for (const r of recurrences) {
    const { id, ...rest } = r
    set('recurrences', id, { ...rest, startsOn: recStart, endsOn: null, exceptions: [] })
  }

  // ── build session descriptors: materialise recurrences −56d … +21d ─────────
  const tplById: Record<string, any> = Object.fromEntries(templates.map((t) => [t.id, t]))
  const sessionDescs: any[] = []
  for (let offset = -56; offset <= 21; offset++) {
    const ymd = addDaysKey(todayKey, offset)
    const wd = tzParts(zonedTimeToUtc(ymd, '12:00')).weekday
    for (const r of recurrences) {
      if (r.weekday !== wd) continue
      const tpl = tplById[r.templateId]
      const startAt = zonedTimeToUtc(ymd, r.time)
      const endAt = new Date(startAt.getTime() + tpl.durationMinutes * 60_000)
      sessionDescs.push({ id: `${r.id}_${ymd}`, ymd, offset, tpl, r, startAt, endAt })
    }
  }

  const PUNCH_ENT: Record<string, string> = { 'cust-2': 'ent-1', 'cust-7': 'ent-2' }
  function coverageList(c: any, n: number): any[] {
    const hasSub = c.buys.some((b: any) => prodById[b[0]].kind === 'subscription')
    const punchBuy = c.buys.find((b: any) => prodById[b[0]].kind === 'punchCard')
    const punchCount = punchBuy ? prodById[punchBuy[0]].punchCount : 0
    const singles = c.buys.filter((b: any) => prodById[b[0]].kind === 'single' && !(b[3]?.refunded))
    const out: any[] = []
    let punchUsed = 0, si = 0
    for (let k = 0; k < n; k++) {
      if (hasSub) out.push({ kind: 'subscription' })
      else if (punchUsed < punchCount) { out.push({ kind: 'punchCard', entId: PUNCH_ENT[c.id] ?? null }); punchUsed++ }
      else { const s = singles[si++ % Math.max(1, singles.length)]; out.push({ kind: 'single', method: s?.[2] ?? 'cash', otherMethodLabel: s?.[3]?.otherLabel ?? null }) }
    }
    return out
  }

  const pastSessions = sessionDescs
    .filter((s) => s.offset < 0)
    .map((s) => ({ id: s.id, start: s.startAt, cap: s.tpl.capacity, price: s.tpl.price }))
    .sort((a, b) => +b.start - +a.start)
  const sessionSeatCount: Record<string, number> = {}
  const sessionHold: Record<string, number> = {}
  const custRegs: Record<string, any[]> = {}
  for (const c of customerDefs) {
    const events = c.events ?? []
    const need = c.attends + events.length
    const picked: any[] = []
    for (const s of pastSessions) {
      if (picked.length >= need) break
      if ((sessionHold[s.id] ?? 0) >= s.cap) continue
      sessionHold[s.id] = (sessionHold[s.id] ?? 0) + 1
      picked.push(s)
    }
    const cov = coverageList(c, c.attends)
    const rows: any[] = []
    picked.slice(0, c.attends).forEach((s, i) => {
      rows.push({ session: s, status: 'attended', coverage: cov[i] })
      sessionSeatCount[s.id] = (sessionSeatCount[s.id] ?? 0) + 1
    })
    picked.slice(c.attends).forEach((s, i) => {
      const ev = events[i]
      const charged = ev.status === 'cancelled' && ev.late && ev.charged
      rows.push({
        session: s, status: ev.status, lateCancel: ev.status === 'cancelled' ? !!ev.late : undefined,
        coverage: charged ? { kind: 'single', method: 'cash', otherMethodLabel: null } : null,
        charge: charged ? PRICE_SINGLE : 0,
      })
      if (ev.status === 'noShow') sessionSeatCount[s.id] = (sessionSeatCount[s.id] ?? 0) + 1
    })
    custRegs[c.id] = rows
  }

  // ── write sessions ─────────────────────────────────────────────────────────
  const sessionIds: string[] = []
  const descById: Record<string, any> = Object.fromEntries(sessionDescs.map((s) => [s.id, s]))
  const buildSession = (s: any, registered: number) => ({
    templateId: s.tpl.id, recurrenceId: s.r.id, occurrenceDate: s.ymd,
    title: s.tpl.title, classTypeId: s.tpl.classTypeId, instructorId: s.tpl.defaultInstructorId,
    startAt: ts(s.startAt), endAt: ts(s.endAt),
    capacity: s.tpl.capacity, price: s.tpl.price,
    registeredCount: registered, status: 'scheduled',
  })
  for (const s of sessionDescs) {
    const registered = s.offset < 0
      ? (sessionSeatCount[s.id] ?? 0)
      : Math.max(0, Math.min(s.tpl.capacity, Math.round(s.tpl.capacity * (0.3 + ((s.offset + 7) * 7 % 60) / 100))))
    set('sessions', s.id, buildSession(s, registered))
    sessionIds.push(s.id)
  }

  // ── registrations ──────────────────────────────────────────────────────────
  for (const c of customerDefs) {
    custRegs[c.id].forEach((row, j) => {
      set('registrations', `reg-${c.id}-${j}`, {
        sessionId: row.session.id, customerId: c.id, status: row.status,
        lateCancel: row.lateCancel ?? null,
        coverage: row.coverage ?? null,
        sourceEntitlementId: row.coverage?.kind === 'punchCard' ? (row.coverage.entId ?? null) : null,
        paymentId: row.charge ? `pay-${c.id}-late${j}` : null,
        createdAt: ts(row.session.start),
      })
    })
  }

  const todaySessions = sessionIds.filter((id) => id.endsWith(todayKey))
  if (todaySessions.length) {
    const sid = todaySessions[0]
    const regs = [
      { customerId: 'cust-1', status: 'booked' },
      { customerId: 'cust-3', status: 'booked' },
      { customerId: 'cust-5', status: 'booked' },
      { customerId: 'cust-7', status: 'booked' },
    ]
    regs.forEach((r, i) => {
      set('registrations', `reg-${sid}-${i}`, {
        sessionId: sid, ...r, sourceEntitlementId: null, paymentId: null, createdAt: ts(daysAgo(0)),
      })
    })
    set('sessions', sid, buildSession(descById[sid], regs.length))
  }

  // ── payments + ledger + invoices ───────────────────────────────────────────
  const PAY_TIMES = ['08:42', '17:05', '19:30', '09:10', '11:20', '07:15']
  const custSpent: Record<string, number> = {}
  let invSeq = 400
  for (const c of customerDefs) {
    let spent = 0
    c.buys.forEach((buy: any, k: number) => {
      const [prodId, d, method, opts = {}] = buy
      const prod = prodById[prodId]
      const amount = prod.price
      const when = daysAgo(d, PAY_TIMES[k % PAY_TIMES.length])
      const status = opts.status ?? 'paid'
      const paid = status === 'paid'
      const payId = `pay-${c.id}-${k}`
      const invoiceId = paid ? `inv-2026-${String(invSeq++).padStart(4, '0')}` : null
      set('payments', payId, {
        customerId: c.id, walkInName: null, productId: prodId,
        productSnapshot: { name: prod.name, price: prod.price, kind: prod.kind },
        amount, promoCodeId: null, method, otherMethodLabel: opts.otherLabel ?? null,
        status: opts.refunded ? 'refunded' : status,
        growTransactionId: method === 'card' ? `grow_${payId}` : null,
        invoiceId, refundOfPaymentId: null, createdAt: ts(when), createdBy: UID,
      })
      if (paid && !opts.refunded) spent += amount
      if (paid) {
        set('ledger', `led_${payId}`, {
          kind: 'payment', amount, description: prod.name,
          refId: payId, invoiceId, period: monthKeyOf(when), createdAt: ts(when),
        })
        set('invoices', invoiceId as string, {
          number: (invoiceId as string).replace('inv-', ''), paymentId: payId, amount,
          kind: 'invoice', createdAt: ts(when), fileUrl: null,
        })
      }
      if (opts.refunded) {
        const rId = `${payId}r`
        const rWhen = daysAgo(Math.max(0, d - 1), '12:00')
        const cInv = `inv-2026-${String(invSeq++).padStart(4, '0')}C`
        set('payments', rId, {
          customerId: c.id, walkInName: null, productId: prodId,
          productSnapshot: { name: prod.name, price: prod.price, kind: prod.kind },
          amount: -amount, promoCodeId: null, method, otherMethodLabel: opts.otherLabel ?? null,
          status: 'refunded', growTransactionId: null, invoiceId: cInv,
          refundOfPaymentId: payId, createdAt: ts(rWhen), createdBy: UID,
        })
        set('invoices', cInv, {
          number: cInv.replace('inv-', ''), paymentId: rId, amount: -amount,
          kind: 'creditInvoice', createdAt: ts(rWhen), fileUrl: null,
        })
        set('ledger', `led_${rId}`, {
          kind: 'refund', amount: -amount, description: `זיכוי — ${prod.name}`,
          refId: rId, invoiceId: cInv, period: monthKeyOf(rWhen), createdAt: ts(rWhen),
        })
      }
    })
    custRegs[c.id].forEach((row, j) => {
      if (!row.charge) return
      const payId = `pay-${c.id}-late${j}`
      const when = row.session.start
      const invoiceId = `inv-2026-${String(invSeq++).padStart(4, '0')}`
      set('payments', payId, {
        customerId: c.id, walkInName: null, productId: 'prod-single',
        productSnapshot: { name: prodById['prod-single'].name, price: PRICE_SINGLE, kind: 'single' },
        amount: row.charge, promoCodeId: null, method: 'cash', otherMethodLabel: null,
        status: 'paid', growTransactionId: null, invoiceId, refundOfPaymentId: null,
        createdAt: ts(when), createdBy: UID,
      })
      set('ledger', `led_${payId}`, {
        kind: 'payment', amount: row.charge, description: `${prodById['prod-single'].name} — ביטול באיחור`,
        refId: payId, invoiceId, period: monthKeyOf(when), createdAt: ts(when),
      })
      set('invoices', invoiceId, {
        number: invoiceId.replace('inv-', ''), paymentId: payId, amount: row.charge,
        kind: 'invoice', createdAt: ts(when), fileUrl: null,
      })
      spent += row.charge
    })
    custSpent[c.id] = spent
  }

  // one walk-in single
  set('payments', 'pay-walkin-1', {
    customerId: null, walkInName: 'אורחת של נועה', productId: 'prod-single',
    productSnapshot: { name: 'כניסה בודדת ליוגה', price: 50, kind: 'single' },
    amount: 50, promoCodeId: null, method: 'cash', otherMethodLabel: null,
    status: 'paid', growTransactionId: null, invoiceId: 'inv-2026-0499',
    refundOfPaymentId: null, createdAt: ts(daysAgo(1, '11:20')), createdBy: UID,
  })
  set('ledger', 'led_pay-walkin-1', {
    kind: 'payment', amount: 50, description: 'כניסה בודדת ליוגה — אורחת של נועה',
    refId: 'pay-walkin-1', invoiceId: 'inv-2026-0499', period: monthKeyOf(daysAgo(1)), createdAt: ts(daysAgo(1, '11:20')),
  })
  set('invoices', 'inv-2026-0499', {
    number: '2026-0499', paymentId: 'pay-walkin-1', amount: 50,
    kind: 'invoice', createdAt: ts(daysAgo(1, '11:20')), fileUrl: null,
  })

  // ── customers: stats derived from payments + attendance ────────────────────
  let publicSeq = 1
  for (const c of customerDefs) {
    const attended = custRegs[c.id].filter((r) => r.status === 'attended')
    const lastVisit = attended.length ? attended[0].session.start : daysAgo(c.buys[0][1])
    set('customers', c.id, {
      firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email,
      publicId: `C-${String(publicSeq++).padStart(4, '0')}`,
      isWalkIn: false, notes: '',
      stats: { totalSpent: custSpent[c.id], sessionsAttended: attended.length, lastVisitAt: ts(lastVisit) },
      createdAt: ts(daysAgo(100)),
    })
  }
  set('counters', 'customers', { next: publicSeq })

  // ── entitlements + subscriptions ───────────────────────────────────────────
  set('entitlements', 'ent-1', {
    customerId: 'cust-2', productId: 'prod-punch10', kind: 'punchCard',
    remaining: 7, expiresAt: ts(daysAgo(-335)), status: 'active', createdAt: ts(daysAgo(30)),
  })
  set('entitlements', 'ent-2', {
    customerId: 'cust-7', productId: 'prod-punch10', kind: 'punchCard',
    remaining: 0, expiresAt: ts(daysAgo(-325)), status: 'used', createdAt: ts(daysAgo(40)),
  })
  // cust-7 finished their first card and bought another — still active
  set('entitlements', 'ent-3', {
    customerId: 'cust-7', productId: 'prod-punch10', kind: 'punchCard',
    remaining: 8, expiresAt: ts(daysAgo(-353)), status: 'active', createdAt: ts(daysAgo(12)),
  })
  const subs = [
    { id: 'sub-1', customerId: 'cust-1', productId: 'prod-sub-yoga', started: 62, next: -28, months: 3, status: 'active' },
    { id: 'sub-2', customerId: 'cust-3', productId: 'prod-sub-studio', started: 36, next: -24, months: 12, status: 'active' },
    { id: 'sub-3', customerId: 'cust-6', productId: 'prod-sub-yoga', started: 95, next: -5, months: 1, status: 'paused' },
  ]
  for (const s of subs) {
    const prod = prodById[s.productId]
    set('subscriptions', s.id, {
      customerId: s.customerId, productId: s.productId,
      productSnapshot: { name: prod.name, price: prod.price },
      startedAt: ts(daysAgo(s.started)), intervalDays: 30,
      nextChargeAt: ts(daysAgo(s.next)), endsAt: ts(daysAgo(s.started - s.months * 30)),
      status: s.status, growTokenRef: `tok_${s.id}`,
    })
  }

  // ── promo codes ────────────────────────────────────────────────────────────
  set('promoCodes', 'promo-summer', {
    code: 'SUMMER10', name: 'הנחת קיץ', description: '10% על כל המוצרים',
    discountKind: 'percent', value: 10, validUntil: ts(daysAgo(-40)),
    audience: 'all', usageLimit: 100, usedCount: 12, active: true, productIds: null,
  })
  set('promoCodes', 'promo-welcome', {
    code: 'WELCOME20', name: 'ברוכים הבאים', description: '₪20 הנחה על כניסה בודדת',
    discountKind: 'fixed', value: 20, validUntil: null,
    audience: 'new', usageLimit: null, usedCount: 4, active: true, productIds: ['prod-single'],
  })

  // ── expenses (+ ledger lines) ──────────────────────────────────────────────
  const expenses = [
    { id: 'exp-1', name: 'מזרנים חדשים', description: '6 מזרני יוגה', amount: 540, when: daysAgo(5), category: 'ציוד' },
    { id: 'exp-2', name: 'שכירות יולי', description: '', amount: 4200, when: daysAgo(20), category: 'שכירות' },
    { id: 'exp-3', name: 'ניקיון', description: 'חברת ניקיון — שבועיים', amount: 380, when: daysAgo(8), category: 'תפעול' },
  ]
  for (const e of expenses) {
    set('expenses', e.id, {
      name: e.name, description: e.description, amount: e.amount,
      date: ts(e.when), attachmentUrl: null, category: e.category, createdAt: ts(e.when),
    })
    set('ledger', `led_${e.id}`, {
      kind: 'expense', amount: -e.amount, description: e.name,
      refId: e.id, invoiceId: null, period: monthKeyOf(e.when), createdAt: ts(e.when),
    })
  }

  // ── one past monthly report ────────────────────────────────────────────────
  const lastMonth = monthKeyOf(daysAgo(35))
  set('reports', lastMonth, {
    period: lastMonth,
    totals: { income: 6180, expenses: 4890, refunds: -90, net: 1200 },
    lineItems: [],
    fileUrl: null,
    sentAt: ts(daysAgo(Math.max(1, tzParts(new Date()).day - 1))),
  })
}
