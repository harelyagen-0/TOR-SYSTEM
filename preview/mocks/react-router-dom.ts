/**
 * Router shim for the artifact preview.
 *
 * src/App.tsx uses createBrowserRouter, which needs the app served from the
 * origin root. An artifact lives at /code/artifact/<id>, so every path 404s.
 * Swapping in the hash router makes routing self-contained and independent of
 * wherever the page is hosted — without touching the app's source.
 *
 * The real package is reached through the `__rrd_real` alias so that aliasing
 * the bare specifier to this file doesn't recurse.
 */
export * from '__rrd_real'
// explicit re-export shadows the same name coming from `export *`
export { createHashRouter as createBrowserRouter } from '__rrd_real'
