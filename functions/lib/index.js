/**
 * Server-side truth for money and schedule invariants:
 *  - a payment reaching `paid` creates the invoice, the ledger line, and the
 *    entitlement/subscription it grants (spec §5, §8.3)
 *  - a refund payment creates a credit invoice + negative ledger line and
 *    flips the original payment to `refunded`
 *  - an expense creates a negative ledger line
 *  - recurrences are MATERIALISED into real session docs on a rolling
 *    12-week horizon (spec §5: editing one occurrence must never touch the series)
 *  - a scheduled job compiles last month's ledger and emails the accountant
 *
 * All ledger/entitlement writes use deterministic doc ids derived from the
 * source doc id, so re-delivery of a trigger can never double-post.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
initializeApp();
const db = getFirestore();
// ── timezone helpers (UTC storage, studio-tz rendering) ─────────────────────
function tzParts(d, tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    return {
        year: +get('year'), month: +get('month'), day: +get('day'),
        hour: +get('hour'), minute: +get('minute'),
        weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    };
}
function utcFromParts(d, tz) {
    const p = tzParts(d, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}
function zonedTimeToUtc(ymd, hm, tz) {
    const [y, m, d] = ymd.split('-').map(Number);
    const [hh, mm] = hm.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    // offset(t) = wall-clock-of(t) − t; solve t + offset(t) = wall in two passes
    const guess = wall - (utcFromParts(new Date(wall), tz) - wall);
    const offset = utcFromParts(new Date(guess), tz) - guess;
    return new Date(wall - offset);
}
function dateKeyOf(d, tz) {
    const p = tzParts(d, tz);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function addDaysKey(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const b = new Date(Date.UTC(y, m - 1, d));
    b.setUTCDate(b.getUTCDate() + n);
    return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`;
}
const monthKeyOf = (d, tz) => dateKeyOf(d, tz).slice(0, 7);
async function tenantTz(tenantId) {
    const t = await db.doc(`tenants/${tenantId}`).get();
    return t.data()?.timezone ?? 'Asia/Jerusalem';
}
const mockInvoiceProvider = {
    async issueInvoice(tenantId, paymentId, amount) {
        return issueMockInvoice(tenantId, paymentId, amount, 'invoice');
    },
    async issueCreditInvoice(tenantId, paymentId, amount) {
        return issueMockInvoice(tenantId, paymentId, amount, 'creditInvoice');
    },
};
async function issueMockInvoice(tenantId, paymentId, amount, kind) {
    const counterRef = db.doc(`tenants/${tenantId}/counters/invoices`);
    const number = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const next = snap.data()?.next ?? 1;
        tx.set(counterRef, { next: next + 1 }, { merge: true });
        const year = new Date().getFullYear();
        return `${year}-${String(next).padStart(4, '0')}${kind === 'creditInvoice' ? 'C' : ''}`;
    });
    const invoiceId = `inv-${number}`;
    await db.doc(`tenants/${tenantId}/invoices/${invoiceId}`).set({
        number, paymentId, amount, kind, createdAt: FieldValue.serverTimestamp(), fileUrl: null,
    });
    return { invoiceId, number };
}
const mockMessageSender = {
    async sendEmail(to, subject) {
        logger.info(`[mock email] to=${to} subject=${subject}`);
    },
};
/** A purchase is one or more lines (product × quantity). Older / seed payments
 *  have no `items` array — fall back to the single product snapshot. */
function linesOf(payment) {
    return Array.isArray(payment.items) && payment.items.length > 0
        ? payment.items
        : [{
                productId: payment.productId,
                name: payment.productSnapshot?.name ?? '',
                kind: payment.productSnapshot?.kind,
                quantity: 1,
            }];
}
/** Every granted unit of a payment, with the line + unit index that forms its
 *  deterministic document id. Granting and revoking walk the same sequence. */
function* grantUnits(payment) {
    const items = linesOf(payment);
    for (let li = 0; li < items.length; li++) {
        const line = items[li];
        if (line.kind !== 'punchCard' && line.kind !== 'subscription')
            continue;
        for (let unit = 0; unit < line.quantity; unit++)
            yield { li, unit, line };
    }
}
// ── payment lifecycle ───────────────────────────────────────────────────────
export const onPaymentWritten = onDocumentWritten('tenants/{tenantId}/payments/{paymentId}', async (event) => {
    const { tenantId, paymentId } = event.params;
    const after = event.data?.after?.data();
    if (!after)
        return; // deleted
    const before = event.data?.before?.data();
    const tz = await tenantTz(tenantId);
    const col = (n) => db.collection(`tenants/${tenantId}/${n}`);
    // A) a REFUND doc appearing (negative amount referencing an original)
    if (after.refundOfPaymentId && after.amount < 0 && !before) {
        if (after.invoiceId)
            return; // this refund doc is already processed
        const originalId = after.refundOfPaymentId;
        const originalRef = col('payments').doc(originalId);
        // Claim the original transactionally: only the first refund to observe a
        // refundable payment proceeds. Two refund docs racing on one payment can
        // no longer both issue a credit invoice and post a negative ledger line.
        const original = await db.runTransaction(async (tx) => {
            const snap = await tx.get(originalRef);
            const data = snap.data();
            if (!data || data.status === 'refunded')
                return null;
            tx.update(originalRef, { status: 'refunded' });
            return data;
        });
        if (!original) {
            logger.warn(`refund ${paymentId}: ${originalId} is already refunded — skipping`);
            return;
        }
        const { invoiceId } = await mockInvoiceProvider.issueCreditInvoice(tenantId, paymentId, after.amount);
        await event.data.after.ref.update({ invoiceId, status: 'refunded' });
        await col('ledger').doc(`led_${paymentId}`).set({
            kind: 'refund', amount: after.amount,
            description: `זיכוי — ${after.productSnapshot?.name ?? ''}`,
            refId: paymentId, invoiceId,
            period: monthKeyOf(new Date(), tz), createdAt: FieldValue.serverTimestamp(),
        });
        // Reverse what the original payment GRANTED, not just its money.
        // Grants carry deterministic ids (`ent_<paymentId>_<line>_<unit>`), so the
        // exact docs are addressable without a query or an index.
        for (const { li, unit, line } of grantUnits(original)) {
            if (line.kind === 'punchCard') {
                const ref = col('entitlements').doc(`ent_${originalId}_${li}_${unit}`);
                if ((await ref.get()).exists)
                    await ref.update({ status: 'revoked', remaining: 0 });
            }
            else if (line.kind === 'subscription') {
                const ref = col('subscriptions').doc(`sub_${originalId}_${li}_${unit}`);
                if ((await ref.get()).exists) {
                    await ref.update({ status: 'cancelled', endsAt: FieldValue.serverTimestamp() });
                }
            }
        }
        // lifetime spend must fall back by the refunded amount (it is negative)
        if (original.customerId) {
            await col('customers').doc(original.customerId).update({
                'stats.totalSpent': FieldValue.increment(after.amount),
            });
        }
        // hand the promo use back so a limited code is not burned by a refund
        if (original.promoCodeId) {
            const promoRef = col('promoCodes').doc(original.promoCodeId);
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(promoRef);
                if (!snap.exists)
                    return;
                const used = snap.data()?.usedCount ?? 0;
                tx.update(promoRef, { usedCount: Math.max(0, used - 1) });
            });
        }
        return;
    }
    // B) a payment transitioning to PAID.
    // A fully-discounted sale settles at ₪0 and must still be invoiced,
    // recorded and — above all — GRANT what it bought. Only a negative amount
    // (a refund, handled above) is excluded here.
    const becamePaid = after.status === 'paid' && before?.status !== 'paid';
    if (!becamePaid || after.amount < 0)
        return;
    if (after.grantsAppliedAt)
        return; // fully processed
    // The invoice number is allocated once (the counter must not advance twice);
    // everything after it is idempotent by deterministic id, and `grantsAppliedAt`
    // is only written when all of it has landed — so a trigger that dies midway
    // retries into the remaining work instead of skipping it forever.
    let invoiceId = after.invoiceId;
    if (!invoiceId) {
        const issued = await mockInvoiceProvider.issueInvoice(tenantId, paymentId, after.amount);
        invoiceId = issued.invoiceId;
        await event.data.after.ref.update({ invoiceId });
    }
    const items = linesOf(after);
    const summary = items
        .map((l) => (l.quantity > 1 ? `${l.name} ×${l.quantity}` : l.name))
        .join(', ');
    await col('ledger').doc(`led_${paymentId}`).set({
        kind: 'payment', amount: after.amount,
        description: `${summary}${after.walkInName ? ` — ${after.walkInName}` : ''}`,
        refId: paymentId, invoiceId,
        period: monthKeyOf(new Date(), tz), createdAt: FieldValue.serverTimestamp(),
    });
    // what the purchase grants — one entitlement / subscription per unit, with
    // deterministic ids (`..._<line>_<unit>`) so a trigger replay never doubles
    if (after.customerId) {
        for (const { li, unit, line } of grantUnits(after)) {
            const product = (await col('products').doc(line.productId).get()).data();
            if (line.kind === 'punchCard') {
                await col('entitlements').doc(`ent_${paymentId}_${li}_${unit}`).set({
                    customerId: after.customerId, productId: line.productId, kind: 'punchCard',
                    remaining: product?.punchCount ?? 0,
                    expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 86400_000)),
                    status: 'active', paymentId, createdAt: FieldValue.serverTimestamp(),
                });
            }
            else {
                const intervalDays = product?.intervalDays ?? 30;
                await col('subscriptions').doc(`sub_${paymentId}_${li}_${unit}`).set({
                    customerId: after.customerId, productId: line.productId,
                    productSnapshot: { name: line.name, price: product?.price ?? 0 },
                    startedAt: FieldValue.serverTimestamp(), intervalDays,
                    nextChargeAt: Timestamp.fromDate(new Date(Date.now() + intervalDays * 86400_000)),
                    endsAt: null, status: 'active', paymentId,
                    growTokenRef: after.growTransactionId ?? null, // [OPEN — spec Q2] recurring token flow
                });
            }
        }
    }
    // Denormalised customer stats + the completion marker, together in one
    // transaction: `stats.totalSpent` is the only non-idempotent write in this
    // handler, so it must land exactly once, with the marker that proves it did.
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(event.data.after.ref);
        if (snap.data()?.grantsAppliedAt)
            return; // a concurrent retry got there first
        if (after.customerId) {
            tx.update(col('customers').doc(after.customerId), {
                'stats.totalSpent': FieldValue.increment(after.amount),
            });
        }
        tx.update(event.data.after.ref, { grantsAppliedAt: FieldValue.serverTimestamp() });
    });
});
// ── expenses → ledger ───────────────────────────────────────────────────────
export const onExpenseCreated = onDocumentCreated('tenants/{tenantId}/expenses/{expenseId}', async (event) => {
    const { tenantId, expenseId } = event.params;
    const data = event.data?.data();
    if (!data)
        return;
    const tz = await tenantTz(tenantId);
    await db.collection(`tenants/${tenantId}/ledger`).doc(`led_${expenseId}`).set({
        kind: 'expense', amount: -Math.abs(data.amount),
        description: data.name ?? '', refId: expenseId, invoiceId: null,
        period: monthKeyOf(data.date?.toDate() ?? new Date(), tz),
        createdAt: FieldValue.serverTimestamp(),
    });
});
// ── recurrence materialisation (rolling 12-week horizon) ────────────────────
export async function materialiseTenantSessions(tenantId) {
    const tz = await tenantTz(tenantId);
    const todayKey = dateKeyOf(new Date(), tz);
    const horizonEnd = addDaysKey(todayKey, 12 * 7);
    const [recSnap, tplSnap] = await Promise.all([
        db.collection(`tenants/${tenantId}/recurrences`).get(),
        db.collection(`tenants/${tenantId}/classTemplates`).get(),
    ]);
    const templates = new Map(tplSnap.docs.map((d) => [d.id, d.data()]));
    const candidates = [];
    for (const recDoc of recSnap.docs) {
        const rec = recDoc.data();
        const tpl = templates.get(rec.templateId);
        if (!tpl)
            continue;
        const exceptions = new Set(rec.exceptions ?? []);
        for (let ymd = todayKey; ymd <= horizonEnd; ymd = addDaysKey(ymd, 1)) {
            if (rec.startsOn && ymd < rec.startsOn)
                continue;
            if (rec.endsOn && ymd > rec.endsOn)
                break;
            const wd = tzParts(zonedTimeToUtc(ymd, '12:00', tz), tz).weekday;
            if (wd !== rec.weekday)
                continue;
            if (exceptions.has(ymd))
                continue;
            // deterministic id = occurrence identity → materialisation is idempotent
            // and an operator's edit to an existing occurrence is never overwritten
            candidates.push({
                ref: db.doc(`tenants/${tenantId}/sessions/${recDoc.id}_${ymd}`),
                ymd, rec, recId: recDoc.id, tpl,
            });
        }
    }
    if (candidates.length === 0)
        return 0;
    // 2 · one getAll per 300 refs instead of a round-trip per occurrence
    const missing = [];
    for (let i = 0; i < candidates.length; i += 300) {
        const slice = candidates.slice(i, i + 300);
        const snaps = await db.getAll(...slice.map((c) => c.ref));
        snaps.forEach((s, j) => { if (!s.exists)
            missing.push(slice[j]); });
    }
    // 3 · batched writes (Firestore caps a batch at 500)
    for (let i = 0; i < missing.length; i += 500) {
        const batch = db.batch();
        for (const c of missing.slice(i, i + 500)) {
            const startAt = zonedTimeToUtc(c.ymd, c.rec.time, tz);
            const endAt = new Date(startAt.getTime() + c.tpl.durationMinutes * 60_000);
            batch.set(c.ref, {
                templateId: c.rec.templateId, recurrenceId: c.recId, occurrenceDate: c.ymd,
                title: c.tpl.title, classTypeId: c.tpl.classTypeId,
                instructorId: c.tpl.defaultInstructorId ?? null,
                startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt),
                capacity: c.tpl.capacity, price: c.tpl.price,
                status: 'scheduled',
            });
        }
        await batch.commit();
    }
    return missing.length;
}
export const materialiseSessions = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Jerusalem' }, async () => {
    const tenants = await db.collection('tenants').get();
    for (const t of tenants.docs) {
        const created = await materialiseTenantSessions(t.id);
        logger.info(`materialised ${created} sessions for ${t.id}`);
    }
});
// ── monthly accountant report ───────────────────────────────────────────────
/** [OPEN — spec Q4]: file format (PDF/Excel/invoice bundle) and exact fields.
 *  The ledger write path is real; the file generator stays behind this single
 *  function until the accountant's requirements are known. */
async function generateAccountantReport(tenantId, period) {
    const lines = await db.collection(`tenants/${tenantId}/ledger`).where('period', '==', period).get();
    let income = 0, expenses = 0, refunds = 0;
    const lineItems = lines.docs.map((d) => d.data());
    for (const l of lineItems) {
        const amount = l.amount;
        if (l.kind === 'payment')
            income += amount;
        else if (l.kind === 'expense')
            expenses += -amount;
        else if (l.kind === 'refund')
            refunds += amount;
    }
    return {
        totals: { income, expenses, refunds, net: income + refunds - expenses },
        lineItems,
        fileUrl: null, // real file generation lands here once the format is decided
    };
}
export async function compileAndSendReport(tenantId, period) {
    const report = await generateAccountantReport(tenantId, period);
    await db.doc(`tenants/${tenantId}/reports/${period}`).set({
        period, ...report, sentAt: FieldValue.serverTimestamp(),
    });
    const tenant = (await db.doc(`tenants/${tenantId}`).get()).data();
    const email = tenant?.accountant?.email;
    if (email) {
        await mockMessageSender.sendEmail(email, `דוח חודשי ${period}`, 'הדוח החודשי מצורף.', report.fileUrl ?? undefined);
    }
}
/** Manual re-send from the UI (spec §8.3). Tenant comes from the caller's
 *  custom claim — never from the request body. */
export const resendReport = onCall(async (request) => {
    const tenantId = request.auth?.token?.tenantId;
    if (typeof tenantId !== 'string' || !tenantId) {
        throw new HttpsError('permission-denied', 'no tenant claim');
    }
    const period = request.data?.period;
    if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) {
        throw new HttpsError('invalid-argument', 'bad period');
    }
    await compileAndSendReport(tenantId, period);
    return { ok: true };
});
/** the month before `now`, as a 'YYYY-MM' key in the given timezone */
function previousMonthKey(now, tz) {
    const [y, m] = dateKeyOf(now, tz).split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
export const monthlyAccountantReport = onSchedule({ schedule: '0 6 1 * *', timeZone: 'Asia/Jerusalem' }, // 1st of month, 06:00
async () => {
    const now = new Date();
    const tenants = await db.collection('tenants').get();
    for (const t of tenants.docs) {
        // the period is each studio's own previous month, not the server's
        const period = previousMonthKey(now, await tenantTz(t.id));
        await compileAndSendReport(t.id, period);
        logger.info(`report ${period} compiled for ${t.id}`);
    }
});
// ── entitlement expiry ──────────────────────────────────────────────────────
/**
 * A punch card carries `expiresAt` (a year from purchase) but nothing ever
 * acted on it: the document stayed `active` forever, so an expired card still
 * looked redeemable. This sweep flips lapsed cards to `expired` once a day.
 */
export async function expireTenantEntitlements(tenantId) {
    const now = Timestamp.now();
    const snap = await db
        .collection(`tenants/${tenantId}/entitlements`)
        .where('status', '==', 'active')
        .where('expiresAt', '<=', now)
        .get();
    if (snap.empty)
        return 0;
    // one batch per 500 docs (Firestore's write limit)
    for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = db.batch();
        for (const d of snap.docs.slice(i, i + 500))
            batch.update(d.ref, { status: 'expired' });
        await batch.commit();
    }
    return snap.size;
}
export const expireEntitlements = onSchedule({ schedule: 'every day 02:30', timeZone: 'Asia/Jerusalem' }, async () => {
    const tenants = await db.collection('tenants').get();
    for (const t of tenants.docs) {
        const n = await expireTenantEntitlements(t.id);
        if (n > 0)
            logger.info(`expired ${n} entitlements for ${t.id}`);
    }
});
//# sourceMappingURL=index.js.map