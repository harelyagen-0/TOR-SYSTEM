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
// Staff provisioning + the custom claims firestore.rules enforces.
// NOTE: this re-export is hoisted — staff.ts is evaluated BEFORE the
// initializeApp() call above, which is why it resolves Firestore lazily rather
// than at module scope. Keep it that way.
export { onStaffWritten, createStaff, updateStaff, setStaffActive, resetStaffPassword, } from './staff.js';
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
        if (!after.invoiceId) {
            const { invoiceId } = await mockInvoiceProvider.issueCreditInvoice(tenantId, paymentId, after.amount);
            await event.data.after.ref.update({ invoiceId, status: 'refunded' });
            await col('payments').doc(after.refundOfPaymentId).update({ status: 'refunded' });
            await col('ledger').doc(`led_${paymentId}`).set({
                kind: 'refund', amount: after.amount,
                description: `זיכוי — ${after.productSnapshot?.name ?? ''}`,
                refId: paymentId, invoiceId,
                period: monthKeyOf(new Date(), tz), createdAt: FieldValue.serverTimestamp(),
            });
        }
        return;
    }
    // B) a payment transitioning to PAID
    const becamePaid = after.status === 'paid' && before?.status !== 'paid';
    if (!becamePaid || after.amount <= 0)
        return;
    if (after.invoiceId)
        return; // already processed (idempotence marker)
    const { invoiceId } = await mockInvoiceProvider.issueInvoice(tenantId, paymentId, after.amount);
    await event.data.after.ref.update({ invoiceId });
    const items = Array.isArray(after.items) && after.items.length > 0
        ? after.items
        : [{
                productId: after.productId,
                name: after.productSnapshot?.name ?? '',
                kind: after.productSnapshot?.kind,
                quantity: 1,
            }];
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
        for (let li = 0; li < items.length; li++) {
            const line = items[li];
            if (line.kind !== 'punchCard' && line.kind !== 'subscription')
                continue;
            const product = (await col('products').doc(line.productId).get()).data();
            for (let u = 0; u < line.quantity; u++) {
                if (line.kind === 'punchCard') {
                    await col('entitlements').doc(`ent_${paymentId}_${li}_${u}`).set({
                        customerId: after.customerId, productId: line.productId, kind: 'punchCard',
                        remaining: product?.punchCount ?? 0,
                        expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 86400_000)),
                        status: 'active', createdAt: FieldValue.serverTimestamp(),
                    });
                }
                else {
                    const intervalDays = product?.intervalDays ?? 30;
                    await col('subscriptions').doc(`sub_${paymentId}_${li}_${u}`).set({
                        customerId: after.customerId, productId: line.productId,
                        productSnapshot: { name: line.name, price: product?.price ?? 0 },
                        startedAt: FieldValue.serverTimestamp(), intervalDays,
                        nextChargeAt: Timestamp.fromDate(new Date(Date.now() + intervalDays * 86400_000)),
                        endsAt: null, status: 'active',
                        growTokenRef: after.growTransactionId ?? null, // [OPEN — spec Q2] recurring token flow
                    });
                }
            }
        }
    }
    // denormalised customer stats
    if (after.customerId) {
        await col('customers').doc(after.customerId).update({
            'stats.totalSpent': FieldValue.increment(after.amount),
        });
    }
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
    let created = 0;
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
            const sessionId = `${recDoc.id}_${ymd}`;
            const ref = db.doc(`tenants/${tenantId}/sessions/${sessionId}`);
            const exists = await ref.get();
            if (exists.exists)
                continue;
            const startAt = zonedTimeToUtc(ymd, rec.time, tz);
            const endAt = new Date(startAt.getTime() + tpl.durationMinutes * 60_000);
            await ref.set({
                templateId: rec.templateId, recurrenceId: recDoc.id, occurrenceDate: ymd,
                title: tpl.title, classTypeId: tpl.classTypeId,
                instructorId: tpl.defaultInstructorId ?? null,
                startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt),
                capacity: tpl.capacity, price: tpl.price,
                registeredCount: 0, status: 'scheduled',
            });
            created++;
        }
    }
    return created;
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
export const monthlyAccountantReport = onSchedule({ schedule: '0 6 1 * *', timeZone: 'Asia/Jerusalem' }, // 1st of month, 06:00
async () => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const period = monthKeyOf(prev, 'Asia/Jerusalem');
    const tenants = await db.collection('tenants').get();
    for (const t of tenants.docs) {
        await compileAndSendReport(t.id, period);
        logger.info(`report ${period} compiled for ${t.id}`);
    }
});
//# sourceMappingURL=index.js.map