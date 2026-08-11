# New-session handoff — Studio OS (operator web app)

Paste the block between the `---` markers into a fresh session to resume.

---

We're building **Studio OS** — a mobile-first, Hebrew/RTL, multi-tenant operator
web app for boutique studios (yoga first). ALL 9 milestones of the spec are BUILT
and VERIFIED; I'm now making fixes/changes on top. Do NOT re-explore — every path
you need is listed here.

## The project

- **App root:** `C:\Users\IMOE001\studio-os\`
- **Spec:** `studio-os-build-prompt.md` (the user pastes/has it; its Hebrew was
  mojibake'd — correct Hebrew already lives in the locale file, trust that)
- **Stack:** React 19 + TypeScript + Vite 8 + Tailwind 4 (CSS-first, `@theme inline`)
  + Firebase 12 (Firestore/Auth/Functions/Storage) + TanStack Query + react-router 7
  + vite-plugin-pwa. Lint = oxlint. **Emulator-first** (no real Firebase project yet).
- Decisions already made by the user (do not relitigate): greenfield app (NOT the
  old pa4-web-surfaces Fastify repo); PLAIN per-spec UI (the magnifying dock from
  the old mockup was explicitly rejected); emulators first.

## File map (all under C:\Users\IMOE001\studio-os\)

- `src/locale/he.ts` — EVERY Hebrew string, keyed; `fmt()` for {placeholders}.
  Rule: no literal Hebrew inside components.
- `src/index.css` — tenant theme: 4 CSS vars (`--t-primary/accent/surface/text`)
  set by TenantProvider; all other tones DERIVED with color-mix; Tailwind tokens
  map to them in `@theme inline`. `[hidden]{display:none!important}` is on purpose.
- `src/types/models.ts` — all Firestore doc types (spec §5).
- `src/lib/firebase.ts` — init + emulator connect (VITE_USE_EMULATORS / VITE_FB_*).
- `src/lib/format.ts` — money/date/tz helpers. `zonedTimeToUtc` uses a two-pass
  offset fix — DO NOT "simplify" it (the naive version was +3h off; already fixed
  in 3 copies: here, `scripts/seed.mjs`, `functions/src/index.ts`).
- `src/data/` — `db.ts` (typed tenantCol + rawCol for writes), `customers.ts`
  (+publicId counter transaction), `payments.ts` (create/refund/useWatchPayment),
  `products.ts`, `promoCodes.ts` (validatePromo audience rules), `expenses.ts`
  (Storage upload), `subscriptions.ts`, `calendar.ts` (sessions/templates/
  instructors/recurrence+client materialisation), `reports.ts` (ledger, resend callable).
- `src/auth/` — AuthProvider (tenantId custom claim = only trust anchor), LoginPage.
- `src/tenant/TenantProvider.tsx` — live tenant doc → theme vars.
- `src/components/` — AppShell, Header (logo right/title centre/date left),
  BottomNav (DOM order = RTL visual: בית·תשלומים·אנליטיקס·יומן·לקוחות), `ui.tsx`
  (Card/Button/Field/Input/Select/SearchInput/OptionTile/StatCard/Pill/Sheet/
  ConfirmDialog/EmptyState/Loading).
- `src/pages/home/HomePage.tsx` — quick actions (deep-link, no home modals),
  today's schedule, 4 KPI cards.
- `src/pages/payments/` — `PaymentsPage.tsx` (six tiles + ?action= deep links),
  `CollectCard.tsx` (the 4-step wizard), `sheets/` Product/History(refund)/
  Promo/Expenses/Report.
- `src/pages/customers/` — CustomersPage (search/+/filter, ?action=add,
  ?view=subscribers, subscription cards w/ pause+cancel), CustomerProfileSheet.
- `src/pages/calendar/` — CalendarPage (week nav + jump + slot tap), WeekGrid
  (overlap splitting, class-type colors), SessionSheet (registrants/attendance/
  edit-one-occurrence/cancel→exception), AddSessionSheet (template→"לערוך את
  התבנית?"→recurrence toggle | new class + save-as-template), TemplatesSheet,
  InstructorsSheet (positive allowedClassTypes list, enforced in all pickers).
- `src/metrics/registry.ts` + `useMetrics.ts` — pluggable metric registry (4 starters).
- `src/integrations/` — PaymentProvider/MessageSender interfaces + mocks (`index.ts`
  selects per tenant; real Grow/messaging land there).
- `functions/src/index.ts` — onPaymentWritten (invoice+ledger+entitlement/
  subscription+stats; idempotence marker = payment.invoiceId; deterministic
  `led_<id>` ledger ids), onExpenseCreated, materialiseSessions (12-week horizon,
  session id = `<recurrenceId>_<ymd>`), monthlyAccountantReport +
  `generateAccountantReport()` stub, resendReport callable (tenant from claim).
- `firestore.rules` — operator only inside own tenant via claim; ledger/reports/
  invoices function-only; entitlements update-only. `storage.rules` same claim.
- `scripts/seed.mjs` — wipes + seeds tenant `demo-yoga` (products, 8 customers,
  templates, 8 recurrences materialised −7d…+21d, payments+refund, subs, promos,
  expenses, ledger). `scripts/cdp-verify.mjs` — the verification harness.
- `README.md` — run + architecture notes. Old design references (NOT this app's
  UI): `C:\Users\IMOE001\owner-app-mockup\`.

## Run

```
npm run emulators   # needs JAVA_HOME="C:/Program Files/Java/jdk-21" (system JAVA_HOME is a broken jdk-16 path)
npm run seed        # after emulators are up
npm run dev         # http://localhost:5199
```
Login: owner@demo.test / demo1234 (tenant demo-yoga).

## Gates + verification (keep doing this before claiming done)

`npx tsc -b` · `npm run lint` · `npm run build` · then
`node scripts/cdp-verify.mjs <out-dir>` — real Chrome over CDP at 390×844
(virtual-time screenshots give false passes), logs in, walks all 5 tabs,
asserts docW==vpW (no h-scroll) and 0 JS errors, writes screenshots. LOOK at
the screenshots — that's how the +3h tz bug was caught.

## Known gotchas

- Firestore emulator can hang silently on first boot (empty firestore-debug.log,
  accepts TCP, never responds): kill ALL java processes and restart. Killing a
  background emulator task leaves an orphan java holding :8080.
- Chrome path: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Functions emulator replays writes — ledger ids must stay deterministic.
- oxlint has 2 accepted fast-refresh warnings (context provider files).

## [OPEN] per spec — stubbed behind interfaces, do NOT invent

Tenant resolution strategy · Grow API + recurring tokens · invoicing provider ·
accountant report file format (`generateAccountantReport`) · booking screen +
punch-card auto-deduction · real WhatsApp/email · final analytics metric list.

## Standalone demo preview (the shared clickable link)

There is a Firebase-free, single-file build of the app used as a shareable
clickable preview (aliases `firebase/*` to `src/demo/` in-memory stand-ins;
enabled by `VITE_DEMO=true`). It is published as a claude.ai Artifact.

**Rebuild + verify (one command):**

```
npm run demo:preview
```

That runs `build:demo`, inlines JS/CSS into `demo-out/preview.html` via
`scripts/inline-demo.mjs`, then `scripts/test-inlined.mjs` loads that exact file
in headless Chromium and asserts it renders (nav present, 0 JS errors). ALWAYS
run this before publishing — do not hand-roll the inlining. (History: a naive
`String.replace()` inliner spliced the page skeleton in wherever the minified
bundle contained a `` $` `` sequence, producing a blank page. `inline-demo.mjs`
uses function replacements to avoid that; the render test is the guardrail.)

**Publish/update the SAME preview (keep the link stable):** publish
`demo-out/preview.html` with the Artifact tool, passing the existing URL as
`url` so it updates in place instead of minting a new link. A fresh session that
did not publish it will get a "hasn't viewed the latest version" guard on first
write — the build is a wholesale replacement, so `force: true` is the intended
resolution here. Keep `favicon: "🧘"` and title "Studio OS" stable.

- Canonical preview URL: `https://claude.ai/code/artifact/918f9721-52a9-4db3-9a44-43ea024bc59b`
- (An earlier duplicate `82cb0145-94fe-4d3f-a6a6-e6d393e5c859` points at the same build; prefer the canonical one above.)

**Two changes live in this preview (branch `claude/system-ui-functionality-d2wtpm`):**
1. `Product.allowedClassTypes` — new-product form (`ProductSheet`) has a
   "סוגי שיעורים מורשים" box to pick which class types a product grants entry to
   (empty = all). Added below the price field; replaces nothing.
2. Enforcement via `src/lib/eligibility.ts` `productCoversClassType()` — the
   `TemplatesSheet` pass picker shows a pass disabled + "לא תקף לסוג שיעור זה"
   when its `allowedClassTypes` doesn't cover the template's class type.

First task: read nothing beyond what I point you at — I'll give you the fixes.

---
