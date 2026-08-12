/**
 * Seeds the Firebase EMULATORS with a demo tenant: operator login, tenant
 * config, catalogue, customers, schedule, payments, ledger.
 *
 * Hebrew literals here are tenant DATA (a studio's own content), not UI
 * strings — the UI-layer no-hard-coded-Hebrew rule does not apply to seeds.
 *
 * Usage: npm run seed   (emulators must be running)
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

const TENANT_ID = 'demo-yoga'
const TZ = 'Asia/Jerusalem'
const OPERATOR = { email: 'owner@demo.test', password: 'demo1234' }

initializeApp({ projectId: 'studio-os-demo' })
const auth = getAuth()
const db = getFirestore()

// ── timezone helpers (mirror src/lib/format.ts) ─────────────────────────────
function tzParts(d, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(d)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: +get('year'), month: +get('month'), day: +get('day'),
    hour: +get('hour'), minute: +get('minute'),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  }
}
function utcFromParts(d, tz) {
  const p = tzParts(d, tz)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}
function zonedTimeToUtc(ymd, hm, tz = TZ) {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // offset(t) = wall-clock-of(t) − t; solve t + offset(t) = wall in two passes
  const guess = wall - (utcFromParts(new Date(wall), tz) - wall)
  const offset = utcFromParts(new Date(guess), tz) - guess
  return new Date(wall - offset)
}
function dateKeyOf(d, tz = TZ) {
  const p = tzParts(d, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
function addDaysKey(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const b = new Date(Date.UTC(y, m - 1, d))
  b.setUTCDate(b.getUTCDate() + n)
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`
}
const monthKeyOf = (d) => dateKeyOf(d).slice(0, 7)
const ts = (date) => Timestamp.fromDate(date)
const daysAgo = (n, hm = '10:00') => zonedTimeToUtc(addDaysKey(dateKeyOf(new Date()), -n), hm)

const col = (name) => db.collection('tenants').doc(TENANT_ID).collection(name)

async function wipeTenant() {
  const names = ['customers', 'products', 'payments', 'invoices', 'entitlements',
    'subscriptions', 'promoCodes', 'expenses', 'instructors', 'classTemplates',
    'recurrences', 'sessions', 'registrations', 'ledger', 'reports', 'counters']
  for (const n of names) {
    const snap = await col(n).get()
    if (snap.empty) continue
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

async function main() {
  // ── operator user + tenant claim ──────────────────────────────────────────
  let user
  try {
    user = await auth.getUserByEmail(OPERATOR.email)
  } catch {
    user = await auth.createUser({ email: OPERATOR.email, password: OPERATOR.password })
  }
  await auth.setCustomUserClaims(user.uid, { tenantId: TENANT_ID })
  const uid = user.uid

  await wipeTenant()

  // ── tenant config ─────────────────────────────────────────────────────────
  await db.collection('tenants').doc(TENANT_ID).set({
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
    contact: { phone: '03-5551234', email: 'studio@gal.co.il', address: 'הרצל 10, תל אביב' },
    social: { instagram: '@studio.gal', facebook: 'studio.gal', tiktok: '@studio.gal', website: 'https://studio-gal.co.il' },
    rooms: ['אולם ראשי', 'חדר מכשירים', 'אולם קטן'],
    policy: { cancellationWindowHours: 12, lateCancelCharge: true },
    integrations: { grow: null, invoicing: null, whatsapp: null },
  })

  // ── instructors ───────────────────────────────────────────────────────────
  const instructors = [
    { id: 'inst-gal', firstName: 'גל', lastName: 'ברק', experience: 'מורה ליוגה 12 שנים, מוסמכת ויניאסה ואשטנגה', allowedClassTypes: ['yoga', 'meditation'], phone: '050-1112233', color: '#0ea5e9', active: true },
    { id: 'inst-noa', firstName: 'נועה', lastName: 'שגב', experience: 'מדריכת פילאטיס מכשירים ומזרן', allowedClassTypes: ['pilates', 'yoga'], phone: '052-4445566', color: '#8b5cf6', active: true },
    { id: 'inst-omer', firstName: 'עומר', lastName: 'דגן', experience: 'יוגה תרפיה', allowedClassTypes: ['yoga'], phone: '054-7778899', color: '#f59e0b', active: true },
  ]
  for (const i of instructors) { const { id, ...rest } = i; await col('instructors').doc(id).set(rest) }

  // ── products ──────────────────────────────────────────────────────────────
  const products = [
    { id: 'prod-single', name: 'כניסה בודדת ליוגה', description: 'שיעור אחד, כל סוגי היוגה', price: 50, kind: 'single', active: true },
    { id: 'prod-punch10', name: 'כרטיסייה 10 כניסות', description: 'בתוקף לשנה מרגע הרכישה', price: 450, kind: 'punchCard', punchCount: 10, active: true },
    { id: 'prod-sub-yoga', name: 'מנוי חודשי — יוגה', description: 'ללא הגבלת כניסות לשיעורי יוגה', price: 300, kind: 'subscription', intervalDays: 30, active: true },
    { id: 'prod-sub-studio', name: 'מנוי חודשי — סטודיו + פילאטיס', description: 'כל השיעורים כולל פילאטיס מכשירים', price: 380, kind: 'subscription', intervalDays: 30, active: true },
  ]
  for (const p of products) { const { id, ...rest } = p; await col('products').doc(id).set({ ...rest, createdAt: ts(daysAgo(90)) }) }
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]))
  const PRICE_SINGLE = prodById['prod-single'].price

  // ── customer scenarios ────────────────────────────────────────────────────
  // Each customer's stat cards (total spent / sessions attended / last visit)
  // are DERIVED below from the payments and attendance we actually write, so a
  // profile's numbers always agree with the history lists beneath them.
  //   buys: [productId, daysAgo, method, opts?]
  //   opts: { status: 'pending', otherLabel, refunded: true }
  //   events: extra (non-attended) registrations — cancellations / no-shows.
  //     { status: 'cancelled'|'noShow', late?: true, charged?: true }
  const customerDefs = [
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

  // ── templates + recurrences ───────────────────────────────────────────────
  const templates = [
    { id: 'tpl-vinyasa', title: 'ויניאסה בוקר', classTypeId: 'yoga', defaultInstructorId: 'inst-gal', capacity: 12, durationMinutes: 60, price: 50, defaultStartTime: '08:00', room: 'אולם ראשי' },
    { id: 'tpl-pilates', title: 'פילאטיס מכשירים', classTypeId: 'pilates', defaultInstructorId: 'inst-noa', capacity: 8, durationMinutes: 55, price: 70, defaultStartTime: '10:00', room: 'חדר מכשירים' },
    { id: 'tpl-evening', title: 'יוגה ערב', classTypeId: 'yoga', defaultInstructorId: 'inst-omer', capacity: 14, durationMinutes: 75, price: 50, defaultStartTime: '18:30', room: 'אולם ראשי' },
    // meditation is NOT covered by the yoga subscription — only the full studio
    // subscription grants entry; everyone else pays a single entry
    { id: 'tpl-medit', title: 'מדיטציה מודרכת', classTypeId: 'meditation', defaultInstructorId: 'inst-gal', capacity: 16, durationMinutes: 45, price: 40, defaultStartTime: '19:45', room: 'אולם קטן', allowedProductIds: ['prod-sub-studio'] },
  ]
  for (const t of templates) { const { id, ...rest } = t; await col('classTemplates').doc(id).set(rest) }

  const todayKey = dateKeyOf(new Date())
  const recStart = addDaysKey(todayKey, -70)
  const recurrences = [
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
    await col('recurrences').doc(id).set({ ...rest, startsOn: recStart, endsOn: null, exceptions: [] })
  }

  // ── build session descriptors: materialise recurrences −56d … +21d ─────────
  // (a wide past window gives every customer real classes to have attended)
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]))
  const sessionDescs = []
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

  // ── how each attended class is covered, derived from what the customer bought:
  // a subscription covers everything; otherwise punches off a 10-pass are used
  // first, then single entries (cash/card/other) in purchase order. ────────────
  const PUNCH_ENT = { 'cust-2': 'ent-1', 'cust-7': 'ent-2' }
  function coverageList(c, n) {
    const hasSub = c.buys.some((b) => prodById[b[0]].kind === 'subscription')
    const punchBuy = c.buys.find((b) => prodById[b[0]].kind === 'punchCard')
    const punchCount = punchBuy ? prodById[punchBuy[0]].punchCount : 0
    const singles = c.buys.filter((b) => prodById[b[0]].kind === 'single' && !(b[3]?.refunded))
    const out = []
    let punchUsed = 0, si = 0
    for (let k = 0; k < n; k++) {
      if (hasSub) out.push({ kind: 'subscription' })
      else if (punchUsed < punchCount) { out.push({ kind: 'punchCard', entId: PUNCH_ENT[c.id] ?? null }); punchUsed++ }
      else { const s = singles[si++ % Math.max(1, singles.length)]; out.push({ kind: 'single', method: s?.[2] ?? 'cash', otherMethodLabel: s?.[3]?.otherLabel ?? null }) }
    }
    return out
  }

  // ── assign real past sessions: `attends` attended (newest, so last-visit is
  // recent) + one per cancellation / no-show event, all distinct. ─────────────
  const pastSessions = sessionDescs
    .filter((s) => s.offset < 0)
    .map((s) => ({ id: s.id, start: s.startAt, cap: s.tpl.capacity, price: s.tpl.price }))
    .sort((a, b) => b.start - a.start)
  const sessionSeatCount = {}  // attended/no-show only → session registeredCount
  const sessionHold = {}       // any pick → capacity + distinctness guard
  const custRegs = {}          // c.id → [{ session, status, lateCancel, coverage, charge }]
  for (const c of customerDefs) {
    const events = c.events ?? []
    const need = c.attends + events.length
    const picked = []
    for (const s of pastSessions) {
      if (picked.length >= need) break
      if ((sessionHold[s.id] ?? 0) >= s.cap) continue
      sessionHold[s.id] = (sessionHold[s.id] ?? 0) + 1
      picked.push(s)
    }
    const cov = coverageList(c, c.attends)
    const rows = []
    picked.slice(0, c.attends).forEach((s, i) => {
      rows.push({ session: s, status: 'attended', coverage: cov[i] })
      sessionSeatCount[s.id] = (sessionSeatCount[s.id] ?? 0) + 1
    })
    picked.slice(c.attends).forEach((s, i) => {
      const ev = events[i]
      const charged = ev.status === 'cancelled' && ev.late && ev.charged
      rows.push({
        session: s, status: ev.status, lateCancel: ev.status === 'cancelled' ? !!ev.late : undefined,
        // a charged late-cancel is billed as a single entry (cash)
        coverage: charged ? { kind: 'single', method: 'cash', otherMethodLabel: null } : null,
        charge: charged ? PRICE_SINGLE : 0,
      })
      if (ev.status === 'noShow') sessionSeatCount[s.id] = (sessionSeatCount[s.id] ?? 0) + 1
    })
    custRegs[c.id] = rows
  }

  // ── write sessions (past count = real seats taken, future = illustrative) ──
  const sessionIds = []
  for (const s of sessionDescs) {
    const registered = s.offset < 0
      ? (sessionSeatCount[s.id] ?? 0)
      : Math.max(0, Math.min(s.tpl.capacity, Math.round(s.tpl.capacity * (0.3 + ((s.offset + 7) * 7 % 60) / 100))))
    await col('sessions').doc(s.id).set({
      templateId: s.tpl.id, recurrenceId: s.r.id, occurrenceDate: s.ymd,
      title: s.tpl.title, classTypeId: s.tpl.classTypeId, instructorId: s.tpl.defaultInstructorId,
      startAt: ts(s.startAt), endAt: ts(s.endAt),
      capacity: s.tpl.capacity, price: s.tpl.price,
      registeredCount: registered, status: 'scheduled',
    })
    sessionIds.push(s.id)
  }

  // ── registrations: one row per class the customer registered for ───────────
  // a charged late-cancel also produces a single payment (below), linked here.
  for (const c of customerDefs) {
    for (const [j, row] of custRegs[c.id].entries()) {
      await col('registrations').doc(`reg-${c.id}-${j}`).set({
        sessionId: row.session.id, customerId: c.id, status: row.status,
        lateCancel: row.lateCancel ?? null,
        coverage: row.coverage ?? null,
        sourceEntitlementId: row.coverage?.kind === 'punchCard' ? (row.coverage.entId ?? null) : null,
        paymentId: row.charge ? `pay-${c.id}-late${j}` : null,
        createdAt: ts(row.session.start),
      })
    }
  }

  // a few upcoming 'booked' regs on today's first session, so the attendance-
  // marking UI has live rows to act on
  const todaySessions = sessionIds.filter((id) => id.endsWith(todayKey))
  if (todaySessions.length) {
    const sid = todaySessions[0]
    const regs = [
      { customerId: 'cust-1', status: 'booked' },
      { customerId: 'cust-3', status: 'booked' },
      { customerId: 'cust-5', status: 'booked' },
      { customerId: 'cust-7', status: 'booked' },
    ]
    for (const [i, r] of regs.entries()) {
      await col('registrations').doc(`reg-${sid}-${i}`).set({
        sessionId: sid, ...r, sourceEntitlementId: null, paymentId: null, createdAt: ts(daysAgo(0)),
      })
    }
    await col('sessions').doc(sid).update({ registeredCount: regs.length })
  }

  // ── payments + ledger + invoices, generated from each customer's purchases ─
  const PAY_TIMES = ['08:42', '17:05', '19:30', '09:10', '11:20', '07:15']
  const custSpent = {}
  let invSeq = 400
  for (const c of customerDefs) {
    let spent = 0
    for (const [k, buy] of c.buys.entries()) {
      const [prodId, d, method, opts = {}] = buy
      const prod = prodById[prodId]
      const amount = prod.price
      const when = daysAgo(d, PAY_TIMES[k % PAY_TIMES.length])
      const status = opts.status ?? 'paid'
      const paid = status === 'paid'
      const payId = `pay-${c.id}-${k}`
      const invoiceId = paid ? `inv-2026-${String(invSeq++).padStart(4, '0')}` : null
      await col('payments').doc(payId).set({
        customerId: c.id, walkInName: null, productId: prodId,
        productSnapshot: { name: prod.name, price: prod.price, kind: prod.kind },
        amount, promoCodeId: null, method, otherMethodLabel: opts.otherLabel ?? null,
        status: opts.refunded ? 'refunded' : status,
        growTransactionId: method === 'card' ? `grow_${payId}` : null,
        invoiceId, refundOfPaymentId: null, createdAt: ts(when), createdBy: uid,
      })
      if (paid && !opts.refunded) spent += amount
      if (paid) {
        // deterministic id `led_<paymentId>` — same scheme as the Cloud Function,
        // so a trigger replay overwrites instead of double-posting
        await col('ledger').doc(`led_${payId}`).set({
          kind: 'payment', amount, description: prod.name,
          refId: payId, invoiceId, period: monthKeyOf(when), createdAt: ts(when),
        })
        await col('invoices').doc(invoiceId).set({
          number: invoiceId.replace('inv-', ''), paymentId: payId, amount,
          kind: 'invoice', createdAt: ts(when), fileUrl: null,
        })
      }
      // a refunded purchase: original marked refunded above + a credit line
      if (opts.refunded) {
        const rId = `${payId}r`
        const rWhen = daysAgo(Math.max(0, d - 1), '12:00')
        const cInv = `inv-2026-${String(invSeq++).padStart(4, '0')}C`
        await col('payments').doc(rId).set({
          customerId: c.id, walkInName: null, productId: prodId,
          productSnapshot: { name: prod.name, price: prod.price, kind: prod.kind },
          amount: -amount, promoCodeId: null, method, otherMethodLabel: opts.otherLabel ?? null,
          status: 'refunded', growTransactionId: null, invoiceId: cInv,
          refundOfPaymentId: payId, createdAt: ts(rWhen), createdBy: uid,
        })
        await col('invoices').doc(cInv).set({
          number: cInv.replace('inv-', ''), paymentId: rId, amount: -amount,
          kind: 'creditInvoice', createdAt: ts(rWhen), fileUrl: null,
        })
        await col('ledger').doc(`led_${rId}`).set({
          kind: 'refund', amount: -amount, description: `זיכוי — ${prod.name}`,
          refId: rId, invoiceId: cInv, period: monthKeyOf(rWhen), createdAt: ts(rWhen),
        })
      }
    }
    // charged late-cancellations bill a single entry (shows in payment history too)
    for (const [j, row] of custRegs[c.id].entries()) {
      if (!row.charge) continue
      const payId = `pay-${c.id}-late${j}`
      const when = row.session.start
      const invoiceId = `inv-2026-${String(invSeq++).padStart(4, '0')}`
      await col('payments').doc(payId).set({
        customerId: c.id, walkInName: null, productId: 'prod-single',
        productSnapshot: { name: prodById['prod-single'].name, price: PRICE_SINGLE, kind: 'single' },
        amount: row.charge, promoCodeId: null, method: 'cash', otherMethodLabel: null,
        status: 'paid', growTransactionId: null, invoiceId, refundOfPaymentId: null,
        createdAt: ts(when), createdBy: uid,
      })
      await col('ledger').doc(`led_${payId}`).set({
        kind: 'payment', amount: row.charge, description: `${prodById['prod-single'].name} — ביטול באיחור`,
        refId: payId, invoiceId, period: monthKeyOf(when), createdAt: ts(when),
      })
      await col('invoices').doc(invoiceId).set({
        number: invoiceId.replace('inv-', ''), paymentId: payId, amount: row.charge,
        kind: 'invoice', createdAt: ts(when), fileUrl: null,
      })
      spent += row.charge
    }
    custSpent[c.id] = spent
  }

  // one walk-in single (no customer profile — shows in payments/analytics)
  await col('payments').doc('pay-walkin-1').set({
    customerId: null, walkInName: 'אורחת של נועה', productId: 'prod-single',
    productSnapshot: { name: 'כניסה בודדת ליוגה', price: 50, kind: 'single' },
    amount: 50, promoCodeId: null, method: 'cash', otherMethodLabel: null,
    status: 'paid', growTransactionId: null, invoiceId: 'inv-2026-0499',
    refundOfPaymentId: null, createdAt: ts(daysAgo(1, '11:20')), createdBy: uid,
  })
  await col('ledger').doc('led_pay-walkin-1').set({
    kind: 'payment', amount: 50, description: 'כניסה בודדת ליוגה — אורחת של נועה',
    refId: 'pay-walkin-1', invoiceId: 'inv-2026-0499', period: monthKeyOf(daysAgo(1)), createdAt: ts(daysAgo(1, '11:20')),
  })
  await col('invoices').doc('inv-2026-0499').set({
    number: '2026-0499', paymentId: 'pay-walkin-1', amount: 50,
    kind: 'invoice', createdAt: ts(daysAgo(1, '11:20')), fileUrl: null,
  })

  // ── customers: stats DERIVED from the payments + attendance above ──────────
  let publicSeq = 1
  for (const c of customerDefs) {
    const attended = custRegs[c.id].filter((r) => r.status === 'attended')
    const lastVisit = attended.length ? attended[0].session.start : daysAgo(c.buys[0][1])
    await col('customers').doc(c.id).set({
      firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email,
      publicId: `C-${String(publicSeq++).padStart(4, '0')}`,
      isWalkIn: false, notes: '',
      stats: { totalSpent: custSpent[c.id], sessionsAttended: attended.length, lastVisitAt: ts(lastVisit) },
      createdAt: ts(daysAgo(100)),
    })
  }
  await col('counters').doc('customers').set({ next: publicSeq })

  // ── entitlements + subscriptions born from the paid payments ─────────────
  // cust-2 bought a 10-punch card and has attended 3 → 7 punches remain
  await col('entitlements').doc('ent-1').set({
    customerId: 'cust-2', productId: 'prod-punch10', kind: 'punchCard',
    remaining: 7, expiresAt: ts(daysAgo(-335)), status: 'active', createdAt: ts(daysAgo(30)),
  })
  // cust-7's 10-punch card is fully spent (10 punches used across 12 classes)
  await col('entitlements').doc('ent-2').set({
    customerId: 'cust-7', productId: 'prod-punch10', kind: 'punchCard',
    remaining: 0, expiresAt: ts(daysAgo(-325)), status: 'used', createdAt: ts(daysAgo(40)),
  })
  const subs = [
    { id: 'sub-1', customerId: 'cust-1', productId: 'prod-sub-yoga', started: 62, next: -28, months: 3, status: 'active' },
    { id: 'sub-2', customerId: 'cust-3', productId: 'prod-sub-studio', started: 36, next: -24, months: 12, status: 'active' },
    { id: 'sub-3', customerId: 'cust-6', productId: 'prod-sub-yoga', started: 95, next: -5, months: 1, status: 'paused' },
  ]
  for (const s of subs) {
    const prod = prodById[s.productId]
    await col('subscriptions').doc(s.id).set({
      customerId: s.customerId, productId: s.productId,
      productSnapshot: { name: prod.name, price: prod.price },
      startedAt: ts(daysAgo(s.started)), intervalDays: 30,
      nextChargeAt: ts(daysAgo(s.next)), endsAt: ts(daysAgo(s.started - s.months * 30)),
      status: s.status, growTokenRef: `tok_${s.id}`,
    })
  }

  // ── promo codes ───────────────────────────────────────────────────────────
  await col('promoCodes').doc('promo-summer').set({
    code: 'SUMMER10', name: 'הנחת קיץ', description: '10% על כל המוצרים',
    discountKind: 'percent', value: 10, validUntil: ts(daysAgo(-40)),
    audience: 'all', usageLimit: 100, usedCount: 12, active: true, productIds: null,
  })
  // WELCOME20 is valid on a single entry only (a "1-time pass" discount)
  await col('promoCodes').doc('promo-welcome').set({
    code: 'WELCOME20', name: 'ברוכים הבאים', description: '₪20 הנחה על כניסה בודדת',
    discountKind: 'fixed', value: 20, validUntil: null,
    audience: 'new', usageLimit: null, usedCount: 4, active: true, productIds: ['prod-single'],
  })

  // ── expenses (+ ledger lines) ─────────────────────────────────────────────
  const expenses = [
    { id: 'exp-1', name: 'מזרנים חדשים', description: '6 מזרני יוגה', amount: 540, when: daysAgo(5), category: 'ציוד' },
    { id: 'exp-2', name: 'שכירות יולי', description: '', amount: 4200, when: daysAgo(20), category: 'שכירות' },
    { id: 'exp-3', name: 'ניקיון', description: 'חברת ניקיון — שבועיים', amount: 380, when: daysAgo(8), category: 'תפעול' },
  ]
  for (const e of expenses) {
    await col('expenses').doc(e.id).set({
      name: e.name, description: e.description, amount: e.amount,
      date: ts(e.when), attachmentUrl: null, category: e.category, createdAt: ts(e.when),
    })
    await col('ledger').doc(`led_${e.id}`).set({
      kind: 'expense', amount: -e.amount, description: e.name,
      refId: e.id, invoiceId: null, period: monthKeyOf(e.when), createdAt: ts(e.when),
    })
  }

  // ── one past monthly report ───────────────────────────────────────────────
  const lastMonth = monthKeyOf(daysAgo(35))
  await col('reports').doc(lastMonth).set({
    period: lastMonth,
    totals: { income: 6180, expenses: 4890, refunds: -90, net: 1200 },
    lineItems: [],
    fileUrl: null,
    sentAt: ts(daysAgo(Math.max(1, tzParts(new Date()).day - 1))),
  })

  console.log('Seed complete.')
  console.log(`  tenant:   ${TENANT_ID}`)
  console.log(`  operator: ${OPERATOR.email} / ${OPERATOR.password}`)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
