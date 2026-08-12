# Studio OS — Developer Handoff

**For:** the developer wiring the backend (database + integrations).
**From:** the UI/product build. Everything below is a factual map of what
exists and exactly what's left for you to connect.

**One-line summary:** Studio OS is a **mobile-first, Hebrew / RTL, multi-tenant
operator web app** for boutique studios (yoga first). The **UI, the
functionality, and the navigation between tabs are built and working**. The
data layer and every external integration are already **behind clean seams** —
your job is to point them at real services. No UI work is required to go live.

---

## 1. Where the code is

- **Repo:** `github.com/harelyagen-0/TOR-SYSTEM`
- **Branch:** `claude/system-ui-functionality-d2wtpm` ← everything is here
- **Live clickable preview (no backend, in-memory data):**
  https://claude.ai/code/artifact/918f9721-52a9-4db3-9a44-43ea024bc59b

```bash
git clone https://github.com/harelyagen-0/TOR-SYSTEM.git
cd TOR-SYSTEM
git checkout claude/system-ui-functionality-d2wtpm
npm install
```

---

## 2. Run it two ways

**A. Firebase-free preview (fastest — see the whole app immediately)**
```bash
npm run dev:demo      # http://localhost:5199, auto-login, in-memory data
# or build the single-file preview that's published as the link above:
npm run demo:preview  # → demo-out/preview.html
```
This aliases `firebase/*` to in-memory stand-ins in `src/demo/` (`VITE_DEMO=true`).
It's how the whole app is demonstrable with **zero backend**. Great for reviewing
UI + flows; **not** the code path you ship.

**B. Real Firebase path (what you'll wire)**
```bash
npm run emulators   # Firebase Emulator Suite (needs JAVA_HOME → JDK 21)
npm run seed        # seed tenant "demo-yoga" into the emulators
npm run dev         # http://localhost:5199
# login: owner@demo.test / demo1234   (tenant: demo-yoga)
```

**Gates (all green on this branch):** `npx tsc -b` · `npm run lint` · `npm run build`.

---

## 3. Stack

React 19 · TypeScript · Vite 8 · **Tailwind 4** (CSS-first, `@theme inline` — *not*
shadcn; custom design tokens live in `src/index.css`) · Firebase 12
(Firestore / Auth / Functions / Storage) · TanStack Query · react-router 7 ·
vite-plugin-pwa · oxlint. One UI dep added for the calendar: `react-day-picker`.

---

## 4. How it's wired (the important part for you)

The app is built so the **entire backend is swappable in a few well-known
places**. You should not need to touch pages/components.

### 4.1 The data layer is the single seam
Every read and write goes through hooks in **`src/data/`** (TanStack Query +
`firebase/firestore`). Nothing in the pages talks to Firestore directly.

| File | Owns |
|---|---|
| `src/data/db.ts` | `tenantCol()` / `rawCol()` / `tenantDoc()` — all tenant scoping in ONE place (`tenants/{tenantId}/…`) |
| `src/data/customers.ts` | customers, entitlements (card passes), registrations, `+publicId` counter |
| `src/data/payments.ts` | create/refund payment, `useWatchPayment` |
| `src/data/products.ts` | products (create / **edit** / activate) |
| `src/data/promoCodes.ts` | promo codes + `validatePromo` audience rules |
| `src/data/subscriptions.ts` | subscriptions (pause/cancel) |
| `src/data/expenses.ts` | expenses + Storage receipt upload |
| `src/data/calendar.ts` | sessions / templates / instructors / recurrence |
| `src/data/reports.ts` | ledger reads, `resendReport` callable |
| `src/data/tenant.ts` | **tenant config writes** (the Settings page) |

All Firestore document shapes are typed in **`src/types/models.ts`** — that's the
schema contract.

### 4.2 Firebase connection = an env drop-in, no code change
`src/lib/firebase.ts` reads `VITE_FB_*` and `VITE_USE_EMULATORS`. To point at a
real project, set a `.env`:
```
VITE_FB_API_KEY=…
VITE_FB_AUTH_DOMAIN=…
VITE_FB_PROJECT_ID=…
VITE_FB_STORAGE_BUCKET=…
VITE_FB_APP_ID=…
VITE_USE_EMULATORS=false
```

### 4.3 Server-side logic already exists as Cloud Functions
`functions/src/index.ts` — deploy these to your project:
- `onPaymentWritten` → issues invoice + ledger line + entitlement/subscription +
  customer stats (idempotent; deterministic `led_<id>` ledger ids)
- `onExpenseCreated` → ledger line
- `materialiseSessions` → materialises recurrences (12-week horizon)
- `monthlyAccountantReport` + `generateAccountantReport()` **stub** (report file
  format is open)
- `resendReport` callable

### 4.4 External integrations sit behind interfaces
`src/integrations/` — each provider is a TS interface with a **mock**
implementation, selected per tenant from `tenant.integrations`:
- `PaymentProvider` (Grow/Meshulam): `charge`, `createPaymentLink`, `refund`,
  `chargeRecurring`
- `MessageSender`: `sendEmail`, `sendWhatsApp`
Swap the mock for the real adapter in `getPaymentProvider()` / `getMessageSender()`.

### 4.5 Security rules
`firestore.rules` + `storage.rules`: an operator may touch only their own tenant
(via a `tenantId` **custom claim**). Ledger / reports / invoices are
function-only (client read-only); entitlements are update-only; the tenant
config doc is operator-updatable (Settings). Deploy these as-is or tighten them.

---

## 5. The app — tabs, functionality, and how they connect

Fixed 5-tab bottom nav (RTL order): **בית · תשלומים · אנליטיקס · יומן · לקוחות**.
A 6th surface, **Settings**, is reached by tapping the studio logo in the header.

- **בית (Home)** — quick actions (deep-link to other tabs with the action
  pre-opened, e.g. "collect payment" → Payments), today's schedule, 4 KPI cards
  (tap → Analytics).
- **תשלומים (Payments)** — the always-visible 4-step **collect wizard** (who →
  what → how → receipt) + six tools: new/edit **products**, customer payment
  history (with refund), promo codes, **expenses** (drag-&-drop receipt upload),
  active subscriptions (→ Customers), **accountant report** (each line carries a
  downloadable invoice file).
- **אנליטיקס (Analytics)** — pluggable metric registry (`src/metrics/`), 4 starters.
- **יומן (Calendar)** — Sun→Sat week grid, class-type colours, session sheet
  (registrants/attendance/edit-one-occurrence/cancel), add session
  (template→recurrence), templates & instructors managers, and a **month
  date-picker** to jump weeks.
- **לקוחות (Customers)** — search / add / **filter** (all · subscribers · card-pass
  holders, multi-select), subscription & card-pass cards (pause/cancel),
  customer profile sheet.
- **הגדרות (Settings)** — business details, **social links**, branding (live
  re-theme), class types, rooms & policy, accountant + locale, integrations
  config, **staff & permissions** (users + per-area access), general info
  (custom fields), customer support, sign out.

Cross-tab connections are wired via router deep-links (`?action=…`, `?view=…`)
and live tenant theming through `TenantProvider`.

---

## 6. ✅ Your checklist (backend + integrations)

Everything below is stubbed behind a seam today. Tackle in roughly this order:

1. **Firebase project** — create it; drop the `VITE_FB_*` env (§4.2);
   `VITE_USE_EMULATORS=false`.
2. **Deploy Cloud Functions** (`functions/src/index.ts`) and **rules**
   (`firestore.rules`, `storage.rules`).
3. **Seed / migrate tenant data** — model shapes in `src/types/models.ts`;
   `scripts/seed.mjs` shows a complete tenant.
4. **Tenant resolution** *(spec [OPEN] Q1)* — how a login maps to a `tenantId`
   claim. Today: custom claim on the token (`src/auth/AuthProvider.tsx`).
5. **Grow / Meshulam payments** *(spec [OPEN] Q2)* — implement `PaymentProvider`
   in `src/integrations/`, incl. recurring tokens for subscriptions.
6. **Invoicing provider** — real tax-invoice generation. Today the accountant
   report generates a **placeholder HTML invoice** per line
   (`src/lib/invoiceFile.ts`) clearly labelled as non-official; swap it to serve
   the provider's real PDF from the invoice doc's `fileUrl`.
7. **WhatsApp / email** *(spec [OPEN] §12)* — implement `MessageSender`.
8. **Staff-user provisioning** — the Settings → staff roster records people +
   intended permissions; wire real Firebase Auth user creation + custom claims
   from it.
9. **Punch-card auto-deduction + booking screen** *(spec [OPEN])*.
10. **Accountant report file format** — `generateAccountantReport()` stub.
11. **Final analytics metric list** — add entries to `src/metrics/registry.ts`
    (layout is automatic).

**Note on the demo backend:** `src/demo/*` is a self-contained in-memory Firebase
stand-in used only for `VITE_DEMO`. Keep it — it's how the app stays demoable —
but it is not part of the production path.

---

## 7. What was built in this handoff round (changelog)

All on `claude/system-ui-functionality-d2wtpm`:

- Customers: **card-pass filter** alongside subscriptions (multi-select).
- **Settings page** (new surface via the header logo): business details, social
  links, branding with live re-theme, class types, rooms & policy, accountant +
  locale, integrations config, staff & permissions, general info, support.
- Calendar: native date-jump replaced with a **themed month calendar** (Hebrew/RTL).
- Expenses: **drag-&-drop receipt upload** with a file chip.
- Accountant report: each line carries its **invoice as a downloadable file**.
- Products: **edit / deactivate** existing products (not just create).

---

## 8. Gotchas

- **Not shadcn.** Tailwind 4 CSS-first with custom tokens (`--t-primary/accent/
  surface/text` + derived via `color-mix`). Don't import shadcn tokens
  (`bg-card`, `text-muted-foreground`, …) — they don't exist here.
- **No literal Hebrew in components** — every string lives in `src/locale/he.ts`.
- Firestore emulator can hang on first boot → kill all `java`, restart.
- Functions replay writes → ledger ids must stay deterministic.
- oxlint has 2 accepted fast-refresh warnings (context provider files).
