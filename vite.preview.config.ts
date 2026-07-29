import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Build for the offline artifact preview.
 *
 * Swaps the Firebase SDK for in-memory mocks at resolve time, so the real app
 * source runs unmodified against seeded data with no network. The artifact CSP
 * blocks every external host, hence: no PWA/service worker, no code splitting,
 * assets inlined, and a single JS chunk the packaging step folds into the HTML.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Root stays the repo root ON PURPOSE: Tailwind v4 scans for utility classes
  // relative to the Vite root, so rooting at preview/ silently produces a
  // stylesheet with almost nothing in it — the app renders completely unstyled.
  base: './',
  resolve: {
    alias: {
      // must precede the bare 'react-router-dom' entry so the shim's own
      // import resolves to the real package instead of back to itself
      __rrd_real: path.resolve(import.meta.dirname, 'node_modules/react-router-dom/dist/index.mjs'),
      'react-router-dom': path.resolve(import.meta.dirname, 'preview/mocks/react-router-dom.ts'),
      'firebase/app': path.resolve(import.meta.dirname, 'preview/mocks/app.ts'),
      'firebase/auth': path.resolve(import.meta.dirname, 'preview/mocks/auth.ts'),
      'firebase/firestore': path.resolve(import.meta.dirname, 'preview/mocks/firestore.ts'),
      'firebase/functions': path.resolve(import.meta.dirname, 'preview/mocks/functions.ts'),
      'firebase/storage': path.resolve(import.meta.dirname, 'preview/mocks/storage.ts'),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'preview-dist'),
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline every asset; no external requests
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'preview/index.html'),
      output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'app[extname]' },
    },
  },
})
