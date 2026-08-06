# Studio OS — full system review

Reviewed at commit `6b1ecb2` (branch `claude/torium-system-review-j8fs7e`).
Scope: every file in `src/`, `functions/src/`, `scripts/`, `firestore.rules`,
`storage.rules`, `firebase.json`, `vite.config.ts`, `firestore.indexes.json`.

**Gates verified locally:** `npx tsc -b` ✅ · `npx oxlint` ✅ (3 known warnings)
· `npx vite build` ✅. Nothing here is a compile error — every finding is a
behavioural, architectural, security or completeness problem.

The codebase is genuinely good: tenancy is centralised in one place, money
invariants really are server-side, the timezone maths is correct and
deliberately so, strings are fully externalised, and the recurrence
materialisation design (deterministic ids + exception list) is the right one.
The problems below are what stands between that and a system a studio can run
its business on.

Severity key: **P0** = cannot go live · **P1** = loses or corrupts money/data ·
**P2** = security / tenancy · **P3** = missing product surface · **P4** =
correctness bug · **P5** = UX / a11y · **P6** = scale · **P7** = engineering
hygiene.

---

## P0 — Blockers to going live

### P0-1 · There is no way to create a tenant or an operator

`setCustomUserClaims` appears in exactly one place in the repo:
`scripts/seed.mjs:88`, which targets the emulator. The `tenantId` custom claim
is "the only trust anchor" (`firestore.rules`, `AuthProvider.tsx`) — and
nothing in production can mint it. `firestore.rules` also has
`allow write: if false` on `tenants/{tenantId}`, so the tenant document itself
can only be created from the Firebase console or an admin script that does not
exist.

Today, onboarding studio #2 is a manual console operation performed by a
developer.

**Fix.** Build a vendor provisioning path as a callable function guarded by a
`vendorAdmin: true` claim:

```
functions/src/admin.ts
  provisionTenant({ tenantId, name, timezone, currency, locale, theme,
                    classTypes, accountant, operatorEmail })
    → creates tenants/{tenantId}
    → creates/looks up the auth user
    → setCustomUserClaims(uid, { tenantId })
    → seeds counters/{customers,invoices} at 1
  addOperator({ email })      // tenant from the caller's own claim
  removeOperator({ uid })
```

Bootstrap the first `vendorAdmin` claim with a one-off `scripts/grant-admin.mjs`
run against the real project. Add an `operators` subcollection under the tenant
so the app can list who has access (custom claims are not enumerable).

Also note: **custom claims are baked into the ID token and only refresh on
token rotation (≈1h)**. `provisionTenant` must return a signal that the client
calls `user.getIdToken(true)` on, or a freshly-provisioned operator sits on the
`noTenant` screen for an hour.

### P0-2 · `firebase.json` has no `hosting` block

There is no `hosting` key at all. Consequences:

- `firebase deploy` deploys rules, indexes and functions — **not the app**.
- Even after adding hosting, without an SPA rewrite every route except `/`
  returns 404 on hard-refresh. `createBrowserRouter` needs
  `rewrites: [{ source: "**", destination: "/index.html" }]`.

**Fix:**

```jsonc
"hosting": {
  "public": "dist",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "rewrites": [{ "source": "**", "destination": "/index.html" }],
  "headers": [
    { "source": "/assets/**",
      "headers": [{ "key": "Cache-Control", "value": "public,max-age=31536000,immutable" }] },
    { "source": "/index.html",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ],
  "predeploy": ["npm run build"]
}
```

### P0-3 · The PWA manifest points at icon files that do not exist

`vite.config.ts` declares `/icons/icon-192.png` and `/icons/icon-512.png`.
`public/` contains only `favicon.svg` and `icons.svg`. The build succeeds and
emits a manifest referencing two 404s — the install prompt is unreliable and
the home-screen icon is broken. This is the whole point of shipping a PWA.

**Fix.** Generate real PNGs (192, 512, 512-maskable, plus an
`apple-touch-icon`) into `public/icons/`, and add a build-time assertion so a
missing icon fails the build rather than shipping silently.

### P0-4 · Card payments taken by link can never become `paid`

`CollectCard.complete()` with `method: 'card'` + `cardMode: 'link'` writes the
payment with `status: 'pending'` and shows the operator a URL. There is **no
Grow webhook, no polling, and no manual "mark as paid" action anywhere in the
UI**. That payment is stranded forever: no invoice, no ledger line, no
entitlement, no subscription, and it never appears in revenue.

The seed even ships one (`cust-5`, `{ status: 'pending' }`) so the state is
visible — but unreachable.

**Fix.** Two parts, both needed:

1. `functions/src/webhooks.ts` — an `onRequest` HTTPS endpoint that verifies
   the provider's signature, looks up the payment by `growTransactionId`, and
   flips `status` to `paid` (or `failed`). `onPaymentWritten` already handles
   the `pending → paid` transition correctly, so the rest cascades for free.
2. A manual **"סמן כשולם"** action in `HistorySheet` for pending rows, for
   cash-in-hand reconciliation and for when a webhook is missed. Route it
   through a callable so the client never writes `status` directly (see P2-2).

Add a scheduled sweeper that marks pending payments older than N days as
`expired` so the list does not accumulate ghosts.

---

## P1 — Money and data integrity

### P1-1 · `onPaymentWritten` is not idempotent for customer stats

```ts
// functions/src/index.ts:204
await col('customers').doc(after.customerId).update({
  'stats.totalSpent': FieldValue.increment(after.amount),
})
```

Cloud Functions triggers are **at-least-once**. The ledger line is protected by
a deterministic id (`led_<paymentId>`) and entitlements by
`ent_<paymentId>_<line>_<unit>` — good. But `FieldValue.increment` is not
idempotent, so a redelivered trigger double-counts the customer's total spent.
The README explicitly claims "replays can't double-post"; for this write, they
can.

**Fix.** Stop deriving stats by increment. Either:

- **(preferred)** make the whole handler a single transaction whose first read
  is the idempotence marker, and do the increment inside it; or
- move `totalSpent` to a **derived read** — sum the customer's ledger lines on
  demand, or maintain it from a separate `onDocumentCreated` on
  `ledger/{id}` keyed by a `stats/applied/{ledgerId}` marker doc written in the
  same transaction as the increment.

The second is the more robust design: the ledger is already the single source
of truth for money, and `stats.totalSpent` should be a projection of it, not a
parallel accumulator.

### P1-2 · The invoice number is allocated *before* the idempotence marker is written

```ts
const { invoiceId } = await mockInvoiceProvider.issueInvoice(...)  // burns a number
await event.data!.after.ref.update({ invoiceId })                  // marker
```

If the function dies between these two lines — timeout, cold-start eviction,
quota — the retry allocates a **second** invoice number for the same payment.
Two concurrent deliveries do the same. Israeli tax law requires gapless
sequential invoice numbering; this produces both duplicates *and* gaps (the
counter also increments even if the subsequent `invoices/{id}.set()` fails).

Two further numbering bugs in `issueMockInvoice`:

- `new Date().getFullYear()` runs in the function's timezone (UTC). An invoice
  issued 00:30 on 1 January Jerusalem time is 22:30 on 31 December UTC → it
  gets **last year's** prefix.
- The counter never resets per year, so `2027-0001` will never exist — the
  sequence just continues from `2026-0847`.

**Fix.** Restructure as one transaction that reads the payment, checks
`invoiceId` is still unset, allocates the counter, and writes the payment
marker + invoice doc together:

```ts
await db.runTransaction(async tx => {
  const pay = await tx.get(paymentRef)
  if (pay.data()?.invoiceId) return null          // already issued — idempotent
  const counter = await tx.get(counterRef)
  ...
  tx.set(counterRef, { year, next: next + 1 })
  tx.set(invoiceRef, {...})
  tx.update(paymentRef, { invoiceId })
})
```

Key the counter per year (`counters/invoices_2026`) and derive the year from
the *tenant's* timezone via `monthKeyOf(...).slice(0,4)`, never from the
server clock. When the real invoicing provider lands (spec Q3), numbering
becomes *their* responsibility and this counter should be retired, not kept in
parallel — decide that explicitly.

### P1-3 · The server never validates the amount

`payment.amount` is computed entirely on the client (`CollectCard`:
`cartTotal` → `validatePromo` → `discountedAmount`) and written straight to
Firestore, where `onPaymentWritten` issues a real invoice and grants real
entitlements from it. The Cloud Function never re-prices the cart, never
re-validates the promo, and never checks that `amount` bears any relation to
`items`.

The rules grant operators unrestricted write on `payments` (P2-2), so this is
not remote-attacker-exploitable today — but it means the accounting record is
built from unverified client input, and any client bug silently produces wrong
invoices.

**Fix.** Move pricing to the server. Replace `useCreatePayment` with a callable
`createPayment({ customerId | walkIn, items: [{productId, quantity}], promoCode,
method, otherMethodLabel })` that:

1. reads each product server-side and prices from **the product doc**, not the
   request;
2. validates and consumes the promo **transactionally** (fixes P1-4);
3. writes the payment with a server-computed `amount` and a
   `pricing: { subtotal, discount, vat, total }` breakdown;
4. returns the payment id.

The client keeps computing a *display* total for the wizard; the server number
is the one that becomes money.

### P1-4 · Promo usage limits are not enforced

`validatePromo` reads `usedCount` from a TanStack cache with
`staleTime: 30_000`; `useConsumePromo` then does an unconditional
`increment(1)` **after** the payment is already written. So:

- two operators (or one operator on a stale cache) can both pass a
  `usageLimit: 1` check and both redeem it;
- if `consumePromo` fails, the discount was granted and never counted;
- a refund never decrements `usedCount`, so a refunded promo redemption
  permanently burns a slot.

**Fix.** Fold promo validation and consumption into the `createPayment`
transaction from P1-3: re-read the promo doc inside the transaction, re-check
`active`/`validUntil`/`audience`/`usageLimit`, and increment in the same commit
as the payment write. On refund, decrement (see P1-5).

### P1-5 · Refunds are structurally incomplete

`useRecordRefund` writes a negative payment doc. That is all. What does **not**
happen:

| Missing | Consequence |
|---|---|
| `provider.refund(transactionId, amount)` is never called | the card is never actually refunded — only the books say so |
| `stats.totalSpent` is never reversed | the customer's lifetime value stays inflated forever |
| the granted entitlement / subscription is never revoked | a refunded 10-pass still has 10 punches; a refunded subscription stays `active` |
| `promoCode.usedCount` is never decremented | see P1-4 |
| partial refunds are impossible | `-Math.abs(original.amount)` is always the full amount; a 3-item cart is all-or-nothing |
| double-submit is not guarded | `ConfirmDialog.onYes` is not disabled while pending — a double-tap writes two refund docs, two credit invoices, two negative ledger lines (`led_<refundId>` differs per doc, so determinism does not help) |

**Fix.** A callable `refundPayment({ paymentId, lines?, reason })` that, in one
transaction: asserts the original is `paid` and not already refunded, computes
the refundable amount (full or per-line), calls the payment provider **first**
and records its result, then writes the refund doc, reverses the entitlement /
subscription it granted (deterministic ids make the reverse lookup trivial —
`ent_<paymentId>_*`), decrements the promo, and reverses stats. Add
`refundedAmount` to the original payment so partial refunds accumulate
correctly and the UI can show "₪150 of ₪450 refunded".

Disable the confirm button while the mutation is pending everywhere
(`ConfirmDialog` should accept a `busy` prop).

### P1-6 · Money is stored as floating-point

`price: number`, `amount: number`, `Math.round(eligibleSubtotal * (value/100))`.
Percent discounts are rounded to whole shekels; float prices accumulate error
across a multi-line cart; `formatMoney` then displays `0` or `2` fraction
digits depending on `Number.isInteger(amount)`, so ₪50 and ₪50.00 appear in the
same list.

**Fix.** Store money as **integer agorot** everywhere (`priceAgorot: number`),
convert only at the display boundary, and fix `formatMoney` to always use
`minimumFractionDigits: 2` (or always 0 with agorot-aware rounding — pick one
and enforce it). This needs a migration script for existing docs; do it before
there is production data, not after.

### P1-7 · No VAT anywhere

There is no מע"מ field on products, payments, invoices, ledger lines or the
accountant report. For an Israeli studio issuing tax invoices this is not
optional — the accountant needs the VAT-exclusive base, the VAT amount and the
rate per line, and the rate changes over time (17% → 18% in 2025).

**Fix.** Add to `TenantConfig`: `vat: { rate: number; inclusive: boolean;
registered: boolean }` (an עוסק פטור charges none). Add to every payment a
`pricing: { netAgorot, vatAgorot, vatRate, grossAgorot }` computed server-side
and **snapshotted** — never recompute historical VAT from the current rate.
Ledger lines and the accountant report carry the same breakdown.

### P1-8 · The ledger period comes from wall-clock now, not the transaction date

```ts
period: monthKeyOf(new Date(), tz)
```

For a payment created at 23:59:50 on the last day of the month whose trigger
runs a second later, the ledger line lands in the **next** accounting period.
Backdated payments are impossible for the same reason. (For refunds, posting
the credit in the current period is correct accounting — but that should be a
stated decision, not an accident of using the same expression.)

**Fix.** Payments: `period: monthKeyOf(after.createdAt.toDate(), tz)` with a
fallback for the `serverTimestamp()` null window. Refunds: keep `new Date()`
but add a comment saying the credit deliberately posts to the current period,
and carry `originalPeriod` on the line so the accountant can reconcile.

### P1-9 · A "re-sent" report is not the report that was sent

`resendReport` → `compileAndSendReport` → `generateAccountantReport`
**recomputes from the live ledger** and overwrites `reports/{period}`. If an
expense for March is entered in April and the operator re-sends the March
report, they now hold a different March report than the one the accountant
filed — with no record that it changed.

**Fix.** Make reports immutable and versioned: `reports/{period}/versions/{n}`,
each with its own `lineItems`, `totals`, `generatedAt`, `sentAt`, and a
`ledgerCursor` (max `createdAt` included). `resendReport` re-sends the existing
version by default; producing a new one is a separate, explicit
`regenerateReport` action that says what changed since version *n*.

### P1-10 · Deleting a payment orphans its ledger line and invoice

`onPaymentWritten` starts with `if (!after) return // deleted`. The rules'
catch-all lets an operator delete any payment doc. The `led_<paymentId>` line
and `inv-<number>` invoice survive, so the books now reference a payment that
does not exist — and the invoice number is burnt.

**Fix.** `allow delete: if false` on `payments`, `expenses`, `invoices` and
`ledger` in the rules (see P2-2). A payment is corrected by refunding it, never
by deleting it — that is what the immutability of an accounting ledger means.

### P1-11 · `CollectCard.complete()` is a multi-step flow with no atomicity and no error handling

```ts
createCustomer → provider.charge → createPayment → consumePromo
```

with no `try/catch` — only `finally { setBusy(false) }`. If `createPayment`
throws after `provider.charge()` succeeded, **the customer was charged and no
record exists**. If `createCustomer` succeeds and the rest fails, an orphan
customer is left behind. Any failure shows the operator nothing at all; the
wizard just sits on step 3.

**Fix.** The server-side `createPayment` callable (P1-3) collapses steps 3–4
into one commit. Charge the card *inside* it, after pricing and before the
write, and record `providerResult` on the payment regardless of outcome so a
charge is never invisible. Create the customer first as its own explicit step
with its own error state. Wrap the whole thing in a `catch` that surfaces a
real error (see P5-1).

---

## P2 — Security and multi-tenancy

### P2-1 · Tenant isolation itself is sound — say so, then keep it that way

`request.auth.token.tenantId == tenantId` with no client-supplied id is the
right design, `storage.rules` mirrors it, and the catch-all denies everything
outside `/tenants`. This is the strongest part of the system. The findings
below are about what happens *inside* a tenant.

One structural note: `match /{collection}/{docId}` is a **single-segment**
wildcard. It covers `tenants/{t}/customers/{c}` but not
`tenants/{t}/customers/{c}/anything`. The current model is flat so this is
fine — but the moment anyone adds a subcollection (e.g. report versions from
P1-9), it will be **unreachable** rather than insecure. Worth a comment in the
rules file.

### P2-2 · Operators have unrestricted write on money collections

The catch-all `match /{collection}/{docId} { allow read, write: if isOperator() }`
covers `payments`, `expenses`, `promoCodes`, `subscriptions` and — critically —
**`counters`**. An operator can:

- reset `counters/invoices.next` and cause duplicate invoice numbers;
- write a payment with `status: 'paid'` *and* a fake `invoiceId`, which makes
  `onPaymentWritten` return early (`if (after.invoiceId) return`) and suppresses
  the ledger line entirely — revenue that never reaches the accountant;
- edit `amount` on a historical payment after the invoice was issued;
- delete anything (P1-10);
- set `promoCodes.usedCount` back to 0.

These are not "the operator is trusted so it's fine" — an operator is a yoga
teacher with a phone, and this is the difference between a mistake and a
silently corrupted tax record.

**Fix.** Narrow the rules to intent, and route the rest through callables:

```
counters/{id}          → allow read, write: if false        (functions only)
payments/{id}          → allow read: if isOperator();
                         allow create: if isOperator()
                           && request.resource.data.invoiceId == null
                           && request.resource.data.status in ['pending','paid'];
                         allow update, delete: if false     (callables only)
expenses/{id}          → allow read, create: if isOperator();
                         allow update, delete: if false
promoCodes/{id}        → allow read, create, update: if isOperator()
                           && request.resource.data.usedCount == resource.data.usedCount;
                         allow delete: if false
subscriptions/{id}     → allow read: if isOperator();
                         allow update: if isOperator()
                           && request.resource.data.diff(resource.data)
                                .affectedKeys().hasOnly(['status']);
                         allow create, delete: if false
```

Once P1-3 moves payment creation to a callable, `payments` can drop to
read-only for clients entirely.

### P2-3 · `entitlements` are freely editable — and this is the unresolved spec question

`allow update: if isOperator()` with no field restriction. An operator can set
`remaining: 999` on any punch card. The rules comment is honest that punch-card
semantics are `[OPEN — spec Q5]`, but the interim position ("let them edit it")
is the least safe one available.

**Fix.** Decide Q5 and implement it server-side. The shape that fits the rest
of the system:

```
consumeEntitlement({ registrationId })   // callable, transactional
  → picks the customer's eligible entitlement (respecting
    ClassTemplate.allowedProductIds — currently dead config, see P3-5)
  → decrements `remaining`, flips to 'used' at zero
  → stamps Registration.coverage + sourceEntitlementId
```

Then lock the rules to `allow update: if false` and give operators an explicit,
audited **"תיקון יתרה"** adjustment action that writes an
`entitlementAdjustments` record with a reason — so a correction is visible
rather than indistinguishable from normal use.

### P2-4 · No App Check, no rate limiting, no audit trail

- **App Check** is not configured, so anyone with the (public, by design)
  Firebase config can hit Firestore and the callables directly with a stolen or
  phished operator credential.
- `resendReport` has no throttle — an operator can spam the accountant's inbox,
  and each call recompiles the whole ledger for a period.
- Nothing records **who** did what. `payment.createdBy` is the only audit
  field in the entire model; refunds, subscription cancellations, session
  cancellations, entitlement edits and customer edits are all anonymous.

**Fix.** Enable App Check (reCAPTCHA Enterprise for web) and enforce it on
Firestore, Storage and every callable. Add a per-caller token bucket on
`resendReport` (a `rateLimits/{uid}` doc checked transactionally, or Cloud
Armor). Add an append-only `auditLog` collection (`allow read: if isOperator();
allow write: if false`) written by every callable with
`{ actor, action, target, before, after, at }`.

### P2-5 · Storage has no size or content-type limits, and receipt URLs are permanent

`storage.rules` allows any authenticated tenant user to write anything of any
size under their prefix. `useCreateExpense` then calls `getDownloadURL()`,
which mints a **permanent, unauthenticated, unrevocable** token URL that is
stored in Firestore — anyone who ever sees that URL can read the receipt
forever, including after the expense is deleted.

**Fix:**

```
match /tenants/{tenantId}/receipts/{file} {
  allow read: if request.auth.token.tenantId == tenantId;
  allow write: if request.auth.token.tenantId == tenantId
    && request.resource.size < 10 * 1024 * 1024
    && request.resource.contentType.matches('image/.*|application/pdf');
}
```

Store the **storage path**, not the download URL, and resolve it to a
short-lived signed URL on demand. Also add a filename sanitiser —
`${Date.now()}_${input.attachment.name}` puts raw user input into a storage
path.

### P2-6 · Production builds fall back to a demo Firebase project

```ts
apiKey: import.meta.env.VITE_FB_API_KEY ?? 'demo-api-key',
projectId: import.meta.env.VITE_FB_PROJECT_ID ?? 'studio-os-demo',
```

A production build with a missing or misspelled env var does not fail — it
silently points at a project that does not exist, and the operator sees an
inscrutable permission error.

**Fix.** Fail loudly at module load when `import.meta.env.PROD` and any
`VITE_FB_*` is absent. Keep the demo defaults only under `import.meta.env.DEV`.
Add a checked-in `.env.example` listing every variable.

---

## P3 — Missing product surface

These are not bugs; they are functionality a studio needs that does not exist.

### P3-1 · Subscriptions never charge — the recurring-revenue product is inert

`Subscription` has `nextChargeAt`, `intervalDays`, `growTokenRef`, and
`PaymentProvider.chargeRecurring()` exists on the interface. **Nothing ever
calls it.** There is no scheduled function that finds due subscriptions and
bills them. Consequences:

- a "monthly subscription" is a one-time payment with a decorative date;
- `nextChargeAt` passes and nothing happens;
- pausing does not push `nextChargeAt`, so resuming charges immediately for the
  paused period;
- cancelling never sets `endsAt`, so `SubscriptionCard` always renders "—" for
  both length and end date and the `months` derivation is dead code;
- a cancelled subscription does not stop the customer attending (nothing reads
  subscription status at the door).

**Fix.** A daily `chargeDueSubscriptions` scheduled function:

```
for each tenant, for each subscription where status == 'active'
                                       and nextChargeAt <= now:
  charge via provider.chargeRecurring(growTokenRef, priceAgorot)
  on success → write a payment doc (which cascades to invoice + ledger)
             → nextChargeAt += intervalDays
  on failure → status = 'pastDue', dunning counter++, notify operator
             → after N failures → status = 'cancelled', endsAt = now
```

Pause must record `pausedAt` and, on resume, advance `nextChargeAt` by the
paused duration. Cancel must set `endsAt` and stop at the end of the paid
period, not immediately. This also needs the Grow recurring-token flow, which
is `[OPEN — spec Q2]` — but the *scheduler, state machine and dunning* can and
should be built now behind the existing interface, with the mock provider.

### P3-2 · No booking screen — so half the data model is inert

There is no way to register a customer for a class. `useSessionRegistrants`
reads registrations, `useMarkAttendance` updates them, but **nothing creates
them** outside `scripts/seed.mjs`. Therefore:

- `Session.registeredCount` is never maintained by the app — it is a seeded
  constant, and every capacity display (`WeekGrid`, `HomePage`, `SessionSheet`)
  is decorative;
- `Registration.coverage`, `sourceEntitlementId`, `paymentId` and `lateCancel`
  are read by `CustomerProfileSheet` and written by nobody;
- `ClassTemplate.allowedProductIds` is configurable in `TemplatesSheet` and
  enforced nowhere;
- entitlements are never consumed (P2-3);
- there is no overbooking guard and no waitlist.

This is `[OPEN — spec Q5]` and correctly not invented — but it is the largest
missing surface, and everything above is blocked on it.

**Fix (design, for when Q5 is decided).** A `bookCustomer({ sessionId,
customerId, coverage })` callable that in one transaction: re-reads the session,
asserts `registeredCount < capacity`, resolves coverage in priority order
(active subscription that grants entry to this template → punch card with
`remaining > 0` → single entry requiring payment), decrements the entitlement,
writes the registration with full `coverage`, and increments
`registeredCount`. Cancellation reverses it, applying the studio's late-cancel
window (which needs to become tenant config:
`policy: { lateCancelHours, lateCancelCharges }`).

### P3-3 · The studio cannot change its own settings

`allow write: if false` on `tenants/{tenantId}`. The studio cannot edit its
name, logo, theme colours, class types, timezone, currency, accountant email or
integration config. Every one of those is a vendor console operation.

**Fix.** A settings screen plus rules that allow the operator to write a
restricted set of fields:

```
allow update: if isOperator()
  && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['name','logoUrl','theme','classTypes','accountant','policy']);
```

Keep `timezone`, `currency` and `integrations` vendor-only — changing a
timezone retroactively reinterprets every stored session.

Deleting a `classType` that sessions reference needs a guard: `WeekGrid`
falls back to the accent colour and `SessionSheet` shows an empty label, so
the failure is silent rather than loud.

### P3-4 · Products and instructors can be created but never edited, archived or removed

- `useCreateProduct` is the only product mutation. A typo'd price is permanent.
  `useProducts(activeOnly)` filters on `active`, but **nothing ever sets
  `active: false`** — there is no way to retire a product.
- `useSaveInstructor` always writes `active: true` and `InstructorsSheet` has
  no deactivate control, so an instructor who leaves stays in every picker
  forever.
- `useDeleteTemplate` exists in `src/data/calendar.ts:302` and is **imported by
  nothing** — dead code. There is no way to delete a class template from the UI.

**Fix.** Add edit + archive (never hard delete — historical payments snapshot
the product name and price, so archiving is safe and deletion is not) for
products; an `active` toggle for instructors; and wire up template deletion
with a guard for the referential problem below.

### P3-5 · Recurrences cannot be edited or deleted, and deleting a template silently kills its series

There is no UI or data function to change a recurrence's weekday, time or end
date, and no "cancel the whole series" — only one-occurrence-at-a-time
exceptions via `useCancelSession`. Meanwhile:

```ts
// functions/src/index.ts:244
const tpl = templates.get(rec.templateId as string)
if (!tpl) continue          // ← silent
```

Delete a template (once P3-4 wires the button up) and every recurrence pointing
at it stops materialising, with no error, no warning and no visible cause. The
already-materialised 12 weeks stay, then the calendar just goes empty.

Separately, `TemplatesSheet.onSubmit` calls `createRecurrence` on **edit** as
well as create — ticking "recurring" while editing an existing template creates
a *second* recurrence, duplicating the whole series on the calendar.

**Fix.** A `RecurrencesSheet` with edit (time / weekday / `endsOn`) and "end
this series" (sets `endsOn = today`, cancels future materialised sessions).
Guard template deletion: refuse if any recurrence references it, and offer to
end those series instead. Make `materialiseTenantSessions` **log a warning**
for a dangling `templateId` rather than `continue` silently. In
`TemplatesSheet`, only offer the recurrence toggle in create mode.

### P3-6 · Punch cards never expire, and their validity is hardcoded

```ts
expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 86400_000))
```

Every punch card expires in exactly 365 days regardless of the product, because
`Product` has no validity field. And **nothing ever flips `status` to
`'expired'`** — `CustomerProfileSheet` filters on `status === 'active'`, so an
expired card shows as usable forever.

**Fix.** Add `validityDays?: number` to `Product` (defaulting to 365) and a
daily `expireEntitlements` scheduled function that flips
`status: 'active' → 'expired'` where `expiresAt < now`. Show expiry prominently
in the profile with a warning tone inside 30 days.

### P3-7 · Analytics is four stat cards

`AnalyticsPage` renders the same four registry metrics `HomePage` already
shows, with no date range, no comparison, no trend and no chart. It is a tab in
the primary navigation with less information than the home screen. The metric
list is `[OPEN — spec §11]`, but the *page* needs to exist regardless.

**Fix.** Give the page a shape the registry can fill: a period selector
(this month / last month / quarter / custom), each metric rendering
value + delta vs previous period + sparkline, and a revenue-by-product
breakdown. Extend `MetricDef` with `compute(ctx)` receiving `{ from, to }`
instead of `now`, and an optional `series()` for the sparkline. Note that
`HomePage` renders *all* registry metrics — adding a fifth silently breaks its
2×2 grid; it should call `useMetrics(['revenueMtd', ...])` explicitly.

### P3-8 · No customer deletion or data export

Israeli privacy law (חוק הגנת הפרטיות) gives a data subject the right to have
their data corrected and deleted. There is no delete, no anonymise, and no
export for a customer — nor any export of the studio's own data.

**Fix.** An `anonymiseCustomer({ customerId })` callable that scrubs
name/phone/email/notes while preserving the financial records the tax authority
requires (payments keep their amounts and invoice references, linked to an
anonymised subject). Plus a customer data export (JSON/CSV) and a full tenant
export.

---

## P4 — Correctness bugs

### P4-1 · A missing Firestore composite index will crash the analytics page in production

`metricRegistry.customersAttendedMtd` queries:

```ts
where('status', '==', 'attended')
where('createdAt', '>=', monthStart)
```

on `registrations`. That requires a composite index `status ASC, createdAt ASC`.
`firestore.indexes.json` declares `registrations(sessionId ASC, createdAt ASC)`
— **not this one**. The emulator serves it happily; production throws
`FAILED_PRECONDITION` and the metric shows `—` forever with a console error the
operator never sees.

**Fix.** Add it:

```jsonc
{
  "collectionGroup": "registrations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status",    "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}
```

More generally: **run every query against a real project once before launch**,
or add a CI step that runs the emulator in strict-index mode. An index miss is
invisible in development and fatal in production.

### P4-2 · `customersAttendedMtd` measures the wrong thing

It filters on `createdAt` — when the registration was *created* — not when the
class happened. A customer who booked in June and attended in July is counted
in June. The metric is labelled "לקוחות שהגיעו החודש".

**Fix.** Stamp `attendedAt: serverTimestamp()` on the registration in
`useMarkAttendance` and filter on that (index: `status, attendedAt`). Denormalise
`sessionStartAt` onto the registration at booking time if you'd rather measure
by class date — either is defensible, but `createdAt` is neither.

### P4-3 · `AddSessionSheet` silently discards the operator's edits when "recurring" is ticked

Trace: template mode → tick **חוזר** → tap **כן** (edit the template) → the
full form opens → the operator changes the time, price and capacity → submit →

```ts
async function createFromForm(tpl) {
  if (recurring && tpl) {
    await createRecurrence.mutateAsync({ template: tpl, ... })   // ← tpl, not form
```

`createRecurrence` materialises from `template.title / capacity / price /
durationMinutes`. Every edit the operator just made — except `time` — is thrown
away without a word. The classes appear on the calendar with the old values.

**Fix.** Build the recurrence from the form, not the template:

```ts
await createRecurrence.mutateAsync({
  template: { ...tpl, title: form.title, capacity: Number(form.capacity),
              price: Number(form.price),
              durationMinutes: Number(form.durationMinutes) },
  weekday: weekdayOfDate, time: form.time, startsOn: form.date, endsOn,
})
```

Better still: give `RecurrenceInput` explicit fields rather than a whole
`ClassTemplate`, so the two sources can't diverge again. Ask explicitly whether
the edits should also update the stored template ("החל גם על התבנית?") — right
now that question is never asked.

### P4-4 · A class that crosses midnight breaks the week grid

`WeekGrid` derives its visible range as `max(22, endAt.hour + …)`. A session
ending at 00:30 gives `hour === 0`, so `dayEndHour` stays 22 and the block's
computed height runs past the container — clipped by `overflow-hidden`, with
the after-midnight portion never drawn on the following day. A late yoga
nidra or a New Year event renders wrong.

Relatedly, `useSessionsForWeek` filters on `startAt` within the week, so a
session that *started* the previous Saturday and runs into Sunday is absent
from the new week entirely.

**Fix.** Clamp block height to the grid and split any session spanning
midnight into two rendered segments (`00:00–end` on the following column),
which also fixes the query: widen the week fetch by one day on each side and
filter by overlap (`startAt < weekEnd && endAt > weekStart`) rather than by
`startAt` alone.

### P4-5 · No conflict detection — rooms and instructors can be double-booked

Two recurrences at the same time both materialise into distinct session ids
(`${recurrenceId}_${ymd}`), so nothing prevents two classes in the same room at
the same hour, or the same instructor teaching two overlapping classes.
`ClassTemplate.room` is stored, shown in no UI, and enforced nowhere.

**Fix.** On session create / recurrence create / session edit, query overlapping
sessions (`startAt < newEnd && endAt > newStart`) and warn on instructor or
room collision — a soft block the operator can override, with the conflict
named. Promote `room` to tenant config (`rooms: [{ id, label, capacity }]`) so
capacity can be validated against the physical room too.

### P4-6 · Template edits never reach already-materialised sessions

`useSaveTemplate` writes the template; materialisation copies template values
into each session **at creation time**. So editing a template's capacity from
12 to 15 changes nothing for the next 12 weeks of already-materialised
sessions. The operator has no way to tell, and no way to apply it.

This is a defensible design (it is the same rule as "editing one occurrence
never touches the series"), but it is currently invisible.

**Fix.** After saving a template, if future materialised sessions exist, ask:
**"להחיל על השיעורים העתידיים?"** — and if yes, batch-update future
`status: 'scheduled'` sessions that still match the old template values (never
ones the operator has already hand-edited; compare field by field).

### P4-7 · The document type lies about the shape of the data

Every write uses `null` where the type declares an optional:

```ts
customerId: input.customerId ?? null      // typed  customerId?: string
invoiceId: null                           // typed  invoiceId?: string
instructorId: input.instructorId ?? null  // typed  instructorId?: string
```

The converter in `db.ts` casts blindly (`snapshot.data() as Omit<T,'id'>`), so
TypeScript believes these are `string | undefined` while the runtime value is
`string | null`. Nothing validates a document on read, so a malformed or
partially-written doc — including any doc written by an older version of the
app — crashes a page (`session.startAt.toMillis()` on a null `startAt`).

There is also a real null window from `serverTimestamp()`: `useWatchPayment`
uses `onSnapshot`, which fires immediately with the local pending-write
snapshot where `createdAt` is `null`.

**Fix.** Introduce runtime schemas (zod or valibot) and validate in the
converter's `fromFirestore`. Failing documents get logged and skipped rather
than crashing a page. Make the types honest (`customerId: string | null`) and
generate the write shape from the same schema so the two cannot drift. This is
also the natural place to handle the `serverTimestamp()` null window
(`createdAt: z.instanceof(Timestamp).nullable()`).

### P4-8 · Escape closes both dialogs at once

`ConfirmDialog` renders a `Sheet` *inside* another open `Sheet`
(`HistorySheet`, `SessionSheet`, `CustomersPage`). Each open `Sheet` attaches
its own `keydown` listener to `document`, so a single Escape closes the confirm
**and** the parent sheet. `Sheet` also has no focus trap, does not restore
focus on close, does not lock body scroll, and leaves the background tabbable
while asserting `aria-modal="true"`.

`hidden={!open}` combined with `[hidden]{display:none!important}` also means the
slide-in/out transition never actually plays — the element goes straight from
`display:none` to visible with no reflow between.

**Fix.** Rebuild `Sheet` on the native `<dialog>` element with `showModal()`,
which gives focus trapping, Escape (cancelable per-dialog), inert background
and top-layer stacking for free. Keep a small stack so nested dialogs close
innermost-first. Use `@starting-style` or toggle `hidden` one frame after the
transform class for the animation.

### P4-9 · The date never rolls over

`Header` computes `const today = new Date()` on render; `HomePage` derives
`dateKey(new Date())` once; `CalendarPage` initialises `weekStart` from
`useState(() => …)`. A PWA left open on the studio's counter overnight shows
yesterday's date in the header and **yesterday's schedule** on the home screen,
with no indication anything is stale.

**Fix.** A `useToday()` hook that recomputes the studio-tz date key and
schedules a timeout to the next local midnight (plus a `visibilitychange`
listener, since backgrounded timers are throttled). Everything date-dependent
reads from it.

### P4-10 · `filterCustomers` misses the searches operators actually type

```ts
if (digits.length >= 3 && c.phone.replace(/\D/g,'').includes(digits)) return true
return c.publicId.toLowerCase() === lower
```

- Phone digits are not normalised, so `+972501234567` and `0501234567` do not
  match each other.
- `publicId` is exact-match only — typing `142` does not find `C-0142`.
- Hebrew name matching is a plain `includes`, so it misses final-letter forms
  (`יוסף`/`יוסף`), niqqud, and any typo.

**Fix.** Normalise phones to E.164 on write and search on the normalised form;
match `publicId` by suffix/prefix as well as exact; strip niqqud and normalise
final letters (`ם ן ץ ף ך` → `מ נ צ פ כ`) on both sides of the comparison. Once
the customer list outgrows memory (P6-1), this moves server-side anyway — plan
for a `searchTokens: string[]` array field with `array-contains`.

---

## P5 — UX and accessibility

### P5-1 · There is no error surface anywhere in the app

Not one `mutateAsync` call has a `catch`. Not one has an error toast. When a
write fails — offline, rules denial, quota — the sheet closes, the form clears,
and the operator believes the payment was taken. This is the single highest-
leverage UX fix in the list, and it is currently absent from all 14 mutation
sites.

**Fix.** A global `<ToastProvider>` plus a shared `useAppMutation` wrapper that
funnels every mutation error into a Hebrew toast with a retry affordance, logs
to the console, and reports to Sentry (P7-4). Add a React `<ErrorBoundary>` at
the route level so a render crash shows a recovery screen instead of a white
page. Add `queryClient` `onError` defaults for read failures too — a failed
query currently renders an empty state indistinguishable from "no data".

### P5-2 · No loading, disabled or success feedback on destructive confirmations

`ConfirmDialog.onYes` fires the mutation and closes immediately. There is no
pending state, so a slow network invites a double-tap (which really does
double-refund — P1-5). There is also **no undo** for any destructive action:
cancelling a session, cancelling a subscription, or refunding.

**Fix.** Give `ConfirmDialog` a `busy` prop that disables both buttons and
shows a spinner. Add an undo window (a toast with **בטל** for ~8 seconds that
reverses the write) for session cancellation and subscription cancellation —
both are cheap to reverse and are the two most likely mis-taps.

### P5-3 · The delete "×" on a calendar block is a 14px destructive target

```tsx
className="absolute right-0 top-0 z-10 grid size-3.5 ..."   // 14 × 14 px
```

sitting directly on top of a tappable session block, in a file whose sibling
components promise "44px minimum touch targets". A thumb aiming for the class
hits delete. The confirm dialog is the only thing between a mis-tap and
permanently adding that date to the recurrence's `exceptions` — with no undo.

**Fix.** Remove the inline × entirely. Cancellation belongs in `SessionSheet`,
which already has it, behind a full-width labelled button. If a fast path is
genuinely wanted, use a long-press or a swipe, not a 14px hit target.

### P5-4 · The week grid is mouse-only

Slot creation is an `onClick` on a `<div>` with no keyboard handler, no
`role`, and no focusability. Session blocks are `role="button" tabIndex={0}`
(good) but the empty-slot path — the primary way to add a class — is
unreachable by keyboard and invisible to a screen reader.

**Fix.** Give each day column a labelled "הוסף שיעור ביום ראשון" button in its
header as the keyboard path, and keep the tap-anywhere gesture as a pointer
enhancement. Add `aria-label`s to session blocks that include the time,
instructor and capacity, not just the title.

### P5-5 · Smaller UI issues worth fixing together

- **`Loading` is a text string.** Every list flashes "טוען…" then reflows.
  Skeleton rows matching the final layout would remove the jank.
- **`EmptyState` has no action.** "אין לקוחות" with no "הוסף לקוח" button.
- **The receipt shows `…` forever** if `onPaymentWritten` fails — no timeout,
  no error, no retry (see P7-4).
- **`formatMoney` is inconsistent** (`0` vs `2` fraction digits depending on
  the value) — see P1-6.
- **`he.ts` has no plural rules.** `subMonth`/`subMonths` is hand-rolled;
  Hebrew has a dual form. Use `Intl.PluralRules('he')`.
- **Locale mismatch:** `TenantConfig.locale` is passed to every `Intl` call
  while `index.html` hardcodes `lang="he" dir="rtl"`. A tenant configured
  `en-US` gets English numerals in an RTL Hebrew shell. Either drive
  `lang`/`dir` from the tenant or drop `locale` from the config and state that
  Hebrew is the product.
- **`he.auth.noTenant` is the only feedback** for a signed-in user without a
  claim — no "contact support", no sign-out button, so they are stuck on a
  dead-end screen with no way back to the login form.

---

## P6 — Scale and performance

### P6-1 · Every list loads its entire collection into memory

`useCustomers`, `useSubscriptions`, `useExpenses`, `usePromoCodes`,
`useProducts` and `useLedger` all do an unbounded `getDocs` with no `limit` and
no cursor. `filterCustomers` then filters client-side. At 2,000 customers that
is a multi-megabyte read on every page load, billed per document, on a phone.

**Fix.** Paginate with `limit(50)` + `startAfter` cursors
(`useInfiniteQuery`), and move search server-side (see P4-10). `useLedger`
should page by day within the month. The metric registry's `revenueMtd` reads
every ledger doc for the month to compute one number — replace it with a
monthly rollup document maintained by the same function that writes ledger
lines.

### P6-2 · `materialiseSessions` iterates every tenant in one invocation

```ts
const tenants = await db.collection('tenants').get()
for (const t of tenants.docs) await materialiseTenantSessions(t.id)
```

Sequential, in a single function with a default timeout. Inside
`materialiseTenantSessions`, each recurrence loops **84 days**, constructing two
`Intl.DateTimeFormat` objects per day (`zonedTimeToUtc` → `tzParts`), and does a
sequential `ref.get()` per matching occurrence. At 100 tenants × 15 recurrences
this exceeds the timeout, and one slow tenant blocks all the others.

**Fix.** Fan out: the scheduled function enqueues one Cloud Task per tenant
against a `materialiseTenant` worker, so tenants are independent, retryable and
parallel. Inside the worker, compute matching dates **arithmetically** from the
weekday instead of walking every day, cache the `Intl.DateTimeFormat` instance
per timezone (constructing one is expensive and it is fully reusable), and
replace the per-occurrence `get()` with one range query for existing session
ids plus a single `BulkWriter` batch. The same fan-out applies to
`monthlyAccountantReport`.

### P6-3 · `useSessionRegistrants` and `useCustomerRegistrations` fetch customers one at a time

```ts
for (const r of regs) {
  const c = await getDoc(doc(rawCol(tenantId,'customers'), r.customerId))
```

Sequential round-trips inside a loop — a 20-person class is 20 serial reads.
`useCustomerRegistrations` at least parallelises with `Promise.all`, but still
issues one read per session.

**Fix.** Use `getAll`/`documentId() in [...]` batched in chunks of 30, or
denormalise `customerName` onto the registration at booking time (it is already
snapshotted elsewhere in the model — `productSnapshot` sets the precedent).

### P6-4 · The bundle is 1.06 MB in one chunk

```
dist/assets/index-sjmvLtf1.js   1,056.42 kB │ gzip: 309.59 kB
```

No code splitting at all — the Firebase SDK, TanStack Query, the router and
every page in one file, on a mobile-first app. Vite's own build warns about it.

**Fix.** `React.lazy` each route (five natural split points), and lazy-load
Firebase Storage and Functions — `getStorage`/`getFunctions` are only needed by
`ExpensesSheet` and `ReportSheet`. That should roughly halve the initial
payload. Add a `build.rolldownOptions.output.manualChunks` split for the
Firebase SDK so it caches independently of app code.

### P6-5 · No offline support in an app that ships as an installable PWA

Firestore's local cache is not configured — no
`persistentLocalCache`/`persistentMultipleTabManager`. A studio with patchy
wifi gets blank screens, and every mutation fails (with no error message —
P5-1). `registerType: 'autoUpdate'` also swaps the service worker without
asking, potentially mid-payment.

**Fix.** Enable `persistentLocalCache` in `lib/firebase.ts` and let Firestore's
offline write queue handle the network gaps it was designed for. Switch the PWA
to `registerType: 'prompt'` with a "גרסה חדשה זמינה — רענן" banner so an update
never lands mid-flow. Add a connectivity indicator so the operator knows when
writes are queued rather than committed.

---

## P7 — Engineering hygiene

### P7-1 · Zero tests

There is no test runner, no test file and no test script. Specifically absent:

- `zonedTimeToUtc` — the file itself documents that the naive version was
  **+3h off** and that the fix is duplicated in **three** places
  (`src/lib/format.ts`, `scripts/seed.mjs`, `functions/src/index.ts`). A
  regression in any copy is silent and nothing guards it. This is the single
  highest-value test in the repo.
- `validatePromo` — pure, branchy, money-affecting, trivially testable.
- `sumLedger`, `layoutDay`, `filterCustomers`, `weekStartKey`/`addDaysKey`.
- The Cloud Functions (idempotence, refund flow, materialisation) — testable
  with `firebase-functions-test` against the emulator.
- The security rules — `@firebase/rules-unit-testing` should prove that tenant
  A cannot read tenant B, that clients cannot write `ledger`, and that every
  restriction from P2-2 actually holds.

**Fix.** Add Vitest for units, `@firebase/rules-unit-testing` for rules, and an
emulator-backed integration suite for the functions. Start with the timezone
helpers and the rules — highest risk, lowest effort.

Also: extract the triplicated timezone helpers into a `shared/` package (or a
single file compiled to both targets) so there is one copy to test.

### P7-2 · No CI

No `.github/workflows`. Nothing runs `tsc`, `oxlint` or `build` on push, so the
gates the README documents depend on someone remembering.

**Fix.** A workflow running `npm ci && npx tsc -b && npm run lint && npm run
build`, plus `npm --prefix functions run build`, plus the emulator-backed tests
from P7-1, on every PR. A deploy job on the default branch gated on all of it.

### P7-3 · Build output is committed, and the SDK versions diverge

- `functions/lib/index.js` and `.js.map` are **checked into git**;
  `.gitignore` does not exclude them. If `predeploy` ever fails, stale compiled
  JavaScript is what deploys.
- `functions/package.json` pins `firebase-admin: ^13.0.0`; the root
  `devDependencies` pin `firebase-admin: ^14.2.0`, and `scripts/seed.mjs` runs
  against the root copy. Two major versions of the Admin SDK write to the same
  database with divergent defaults.

**Fix.** Add `functions/lib/` to `.gitignore` and `git rm -r --cached` it.
Align both on `firebase-admin@^14` and verify the Functions runtime supports it
(Node 22 does). Add `engines` to the root `package.json` to match.

### P7-4 · No observability

If `onPaymentWritten` fails, nothing anywhere notices. The receipt shows `…`
forever, the ledger silently lacks a line, and the accountant's monthly report
is quietly wrong. There is no error reporting, no alerting, no dead-letter
handling and no dashboard.

**Fix.** Wrap every function body in try/catch that logs structured errors
(`logger.error` with `tenantId`, `paymentId`, `err`) and re-throws so Cloud
Functions retries. Add a log-based alert on any error in the payments path,
routed to the vendor (not the studio). Add Sentry to the client. Give the
receipt step a 15-second timeout after which it shows "החשבונית מונפקת…" with a
support path instead of an eternal ellipsis. Write failures to a
`failedOperations` collection the vendor can inspect.

### P7-5 · Documentation drifts from the code

- `NEW-SESSION-PROMPT.md` hardcodes `C:\Users\IMOE001\studio-os\` throughout
  and describes a Windows-only workflow (`JAVA_HOME`, a hardcoded Chrome path
  in `scripts/cdp-verify.mjs`) — the repo is not portable to another machine.
- The README asserts that deterministic ledger ids mean "replays can't
  double-post"; P1-1 shows one write where they can.
- The README's "Pointing at a real Firebase project later is a `.env` drop-in —
  no code change" is not true: hosting config (P0-2), icons (P0-3), tenant
  provisioning (P0-1) and the missing index (P4-1) all block it.

**Fix.** Replace the machine-specific handoff doc with a `CONTRIBUTING.md`
using relative paths; make `cdp-verify.mjs` resolve Chrome per-platform or via
Playwright's bundled Chromium; correct the two README claims; and add a
`docs/DEPLOY.md` that lists every step to reach production (which, as of this
review, does not exist end to end).

---

## Suggested order of work

**Ship-blocking, do first (roughly 1–2 weeks):**
P0-1 provisioning · P0-2 hosting · P0-3 icons · P4-1 missing index ·
P2-2 rules narrowing · P5-1 error surface.

**Money correctness, do before real customers (2–3 weeks):**
P1-2 transactional invoicing · P1-3 server-side pricing · P1-4 promo
transactions · P1-1 idempotent stats · P1-5 complete refunds · P1-6 agorot ·
P1-7 VAT · P0-4 payment webhook.

**Product completeness (the long pole):**
P3-2 booking + P2-3 entitlement consumption (these unlock each other) ·
P3-1 subscription billing · P3-3 settings · P3-5 recurrence management ·
P3-4 product/instructor lifecycle.

**Then:** P7-1 tests + P7-2 CI (arguably these belong first — they are what
keeps everything above from regressing), P6 scale work, P5 polish.

The three decisions that unblock the most: **Q1 tenant resolution** (P0-1),
**Q2 the Grow recurring-token flow** (P3-1, P0-4), and **Q5 punch-card
deduction** (P3-2, P2-3, and most of the inert data model).
