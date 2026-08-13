import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Self-contained preview build: Firebase is replaced by in-memory mocks and the
// whole app bundles into one JS + one CSS, ready to inline into a single HTML.
const r = (p: string) => path.resolve(__dirname, p)

// Hash-based routing so the single-file preview works from file:// and from
// any hosted artifact path (no server-side route rewrites available there).
const hashRouter = {
  name: 'browser-to-hash-router',
  transform(code: string, id: string) {
    if (id.replace(/\\/g, '/').endsWith('/src/App.tsx')) {
      return { code: code.replaceAll('createBrowserRouter', 'createHashRouter'), map: null }
    }
  },
}

export default defineConfig({
  plugins: [hashRouter, react(), tailwindcss()],
  resolve: {
    alias: {
      'firebase/app': r('preview/mock/app.js'),
      'firebase/auth': r('preview/mock/auth.js'),
      'firebase/firestore': r('preview/mock/firestore.js'),
      'firebase/storage': r('preview/mock/storage.js'),
      'firebase/functions': r('preview/mock/functions.js'),
    },
  },
  define: { 'import.meta.env.VITE_USE_EMULATORS': '"false"' },
  build: {
    outDir: 'dist-preview',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'app.[ext]' },
    },
  },
})
