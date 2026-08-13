# Self-contained live preview

Bundles the whole app into a single HTML file with Firebase replaced by an
in-memory fake seeded with the demo data — so the app runs with no backend,
suitable for publishing as a shareable static preview.

## Regenerate

```bash
# 1. seed the emulators and export the demo data (one-time per data change)
npm run emulators &            # auth + firestore + storage
node scripts/seed.mjs
node scripts/dump.mjs preview/seed-data.json

# 2. build the self-contained bundle and inline it into one file
npx vite build --config vite.config.preview.ts
node scripts/inline-preview.mjs dist-preview .
#   -> preview-standalone.html  (open directly in a browser)
#   -> preview-artifact.html    (content-only, for the Artifact publisher)
```

## How it works

- `vite.config.preview.ts` aliases `firebase/{app,auth,firestore,storage,functions}`
  to the mocks in `preview/mock/`, and rewrites `createBrowserRouter` →
  `createHashRouter` so routing works from `file://` and any hosted path.
- `preview/mock/firestore.js` is an in-memory Firestore (collection/doc/query/
  where/orderBy, get/add/set/update/delete, onSnapshot, runTransaction, and the
  increment/arrayUnion/serverTimestamp/Timestamp sentinels), seeded from
  `preview/seed-data.json`.
- `preview/mock/auth.js` auto-signs-in the demo operator; sign out returns to the
  login screen and any credentials sign back in.

Nothing here ships in the real app build (`npm run build`) — it is used only by
the preview config.
