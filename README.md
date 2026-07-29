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

Demo logins (tenant `demo-yoga`):

| | role | sees |
|---|---|---|
| **owner@demo.test** / demo1234 | owner | everything, including Settings |
| **staff@demo.test** / demo1234 | staff | calendar (edit) + customers (read-only) |

Pointing at a real Firebase project later: set `VITE_FB_*` env vars and
`VITE_USE_EMULATORS=false` — no code change.

> **Upgrading an existing local setup:** authorisation now rides on a `perms`
> custom claim. A token minted before roles existed has no `perms` and resolves
> to "no access" by design (fail closed). Re-run `npm run seed` and sign in
> again.

## Verification

```bash
npx tsc -b && npm run lint && npm run build   # gates
npm run verify:rules                          # firestore.rules vs. the role matrix
node scripts/cdp-verify.mjs cdp-out           # real-Chrome 390px pass:
                                              # no h-scroll, 0 JS errors, screenshots
```

`verify:rules` needs the emulators running; it asserts each role's real
server-side allow/deny (25 cases) so the UI gating can't drift from what
Firestore actually enforces. It writes scratch docs into `demo-yoga` — re-run
`npm run seed` afterwards.

`cdp-verify` defaults to the Windows Chrome path; set `CHROME_PATH` to run it
elsewhere.

## Offline preview (`preview/`)

Builds the real app into one self-contained HTML file that runs with no
backend — for sharing a clickable demo.

```bash
npm run emulators && npm run seed   # once, to have data to capture
npm run preview:dump                # emulator state → preview/seed-data.json
npm run preview:build               # → preview-dist/artifact.html
npm run preview:verify              # drives it in Chrome, asserts the gating
```

`vite.preview.config.ts` aliases `firebase/{app,auth,firestore,functions,storage}`
to in-memory mocks in `preview/mocks/`, so **no file under `src/` changes** — the
real components, the real `useCan` gating and the real callable guards run
against seeded data held in the tab. `react-router-dom` is shimmed to the hash
router because an artifact is not served from the origin root.

Two things to keep in mind when touching this:

- The Vite root must stay the **repo root**. Tailwind v4 scans for utilities
  relative to it, so rooting at `preview/` yields a near-empty stylesheet and
  the app renders unstyled — while DOM-only assertions still pass. That is why
  `preview:verify` checks computed style (`rounded-card` → 14px, the nav's five
  columns), not just element counts.
- It cannot demonstrate `firestore.rules` — there is no server. The preview
  shows the UI gating that mirrors the rules; enforcement is proven by
  `npm run verify:rules`.

## Architecture notes

- **Tenancy**: everything under `tenants/{tenantId}/…`; the operator's
  `tenantId` custom claim is the only trust anchor (`firestore.rules`).
- **Roles & permissions**: six areas (payments · customers · calendar ·
  analytics · finance · settings) × three levels (none/view/edit), with
  owner/manager/staff presets the owner can override per person
  (`src/auth/permissions.ts`, mirrored in `functions/src/permissions.ts` —
  separate TS packages can't share an import). The staff doc
  (`tenants/{t}/staff/{uid}`, id = the Auth uid) is the editable source of
  truth; `onStaffWritten` mirrors it into custom claims, and **the claims are
  what `firestore.rules` enforces**. Levels are numeric in the claim so rules
  can compare them ordinally. The staff collection is write-denied to every
  client — all mutations go through owner-gated callables, or a client could
  grant itself anything. Staff are deactivated, never deleted
  (`Payment.createdBy` holds a raw uid). Claim changes reach an open session
  within seconds: the trigger bumps `claimsUpdatedAt`, which the client watches
  to force `getIdToken(true)`.
- **Settings** (`/settings`, gear in the header — the bottom bar stays at the
  specced five tabs): studio profile + the four theme colours, class types,
  business rules (cancellation window, calendar day range) + accountant, and
  staff & permissions. Writes go straight to the tenant doc under a rules
  key-allowlist; `integrations` is excluded on purpose — it holds provider
  credentials and the doc is readable tenant-wide.
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
