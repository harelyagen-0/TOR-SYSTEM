# Studio OS — operator web app

Mobile-first, Hebrew/RTL, multi-tenant operator console for boutique studios
(built to the `studio-os-build-prompt.md` spec). React + TypeScript + Vite +
Tailwind 4 + Firebase (Firestore, Auth, Functions, Storage), installable PWA.

## Run locally (emulator-first)

```bash
npm install
npm --prefix functions install

# 1 · emulators (auth 9099, firestore 8080, functions 5001, storage 9199, UI 4000)
npm run emulators

# 2 · demo data (new terminal)
npm run seed

# 3 · dev server → http://localhost:5199
npm run dev
```

Demo login: **owner@demo.test / demo1234** (tenant `demo-yoga`).

Pointing at a real Firebase project later: set `VITE_FB_*` env vars and
`VITE_USE_EMULATORS=false` — no code change.

## Standalone demo (no backend at all)

For a click-through demo with **no Firebase, no emulators, no Java, no seed
step** — everything runs in the browser against an in-memory backend:

```bash
npm install
npm run dev:demo     # → http://localhost:5199  (auto-logs-in to tenant demo-yoga)
# or a static bundle you can host / open anywhere:
npm run build:demo   # → dist/  (hash-routed, PWA off, ~477 kB)
node scripts/demo-verify.mjs demo-out   # headless smoke test + screenshots
```

How it works (`src/demo/`, wired by a `VITE_DEMO=true` alias in `vite.config.ts`):
`firebase/{app,firestore,auth,functions,storage}` are swapped for in-memory
stand-ins that reimplement exactly the Firestore surface the app uses **plus the
Cloud Function triggers** (`onPaymentWritten`, `onExpenseCreated`) and the
accountant-report compiler — so money + schedule invariants behave identically
(a cash sale really issues an invoice + ledger line + entitlement). The dataset
is a faithful port of `scripts/seed.mjs` (tenant *סטודיו גל*, catalogue, 8
customers, schedule, payments, subscriptions). **None of `src/demo/` ships in
the normal build.** When the real backend lands this whole layer just gets
deleted.

## Verification

```bash
npx tsc -b && npm run lint && npm run build   # gates
node scripts/cdp-verify.mjs cdp-out           # real-Chrome 390px pass:
                                              # no h-scroll, 0 JS errors, screenshots
```

## Architecture notes

- **Tenancy**: everything under `tenants/{tenantId}/…`; the operator's
  `tenantId` custom claim is the only trust anchor (`firestore.rules`).
- **Theme**: 4 tenant colours (`theme.primary/accent/surface/text`) → CSS
  custom properties; every other tone is derived with `color-mix`. No studio
  data is hard-coded in the UI layer.
- **Strings**: all Hebrew lives in `src/locale/he.ts`, keyed by token.
- **Money invariants are server-side** (`functions/src/index.ts`): a payment
  reaching `paid` triggers invoice + ledger line + entitlement/subscription;
  refunds trigger credit invoice + negative line; expenses post negative lines.
  Ledger doc ids are deterministic (`led_<sourceId>`) so replays can't double-post.
- **Recurrences are materialised** into real session docs (12-week rolling
  horizon; nightly function + immediate client-side materialisation on
  creation). Editing one occurrence never touches the series; deleting one
  adds it to the recurrence's `exceptions`.
- **Integrations** (`src/integrations/`): `PaymentProvider` (Grow),
  `MessageSender` behind interfaces with mock implementations; the server-side
  `InvoiceProvider` mock allocates sequential invoice numbers.

## [OPEN] decisions stubbed, not invented

Auth/tenant resolution strategy · Grow API flavour + recurring tokens ·
invoicing provider · accountant report file format (`generateAccountantReport`)
· booking screen / punch-card auto-deduction · real WhatsApp/email transport ·
final analytics metric list (registry in `src/metrics/registry.ts`).
