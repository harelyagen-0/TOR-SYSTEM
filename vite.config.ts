import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Standalone demo build: no Firebase backend. `firebase/*` is aliased to the
// in-memory stand-ins in src/demo/, PWA is off, and assets are relative so the
// build can be served (or inlined) from any path. Enable with VITE_DEMO=true.
const demo = process.env.VITE_DEMO === 'true'

const demoAlias = (name: string, file: string) => ({
  find: new RegExp(`^firebase/${name}$`),
  replacement: fileURLToPath(new URL(`./src/demo/${file}`, import.meta.url)),
})

// https://vite.dev/config/
export default defineConfig({
  base: demo ? './' : '/',
  resolve: demo
    ? {
        alias: [
          demoAlias('app', 'app.ts'),
          demoAlias('firestore', 'firestore.ts'),
          demoAlias('auth', 'auth.ts'),
          demoAlias('functions', 'functions.ts'),
          demoAlias('storage', 'storage.ts'),
        ],
      }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    // Operators install the app to the home screen and run it standalone.
    // (Disabled for the demo build — a service worker only gets in the way of a
    // throwaway preview.)
    ...(demo
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            manifest: {
              // Vendor product name only — never a studio name (template rule).
              name: 'Studio OS',
              short_name: 'Studio OS',
              dir: 'rtl',
              lang: 'he',
              display: 'standalone',
              start_url: '/',
              background_color: '#f4f5f8',
              theme_color: '#0070f3',
              icons: [
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // The app is useless without live data; only the shell is cached.
              navigateFallbackDenylist: [/^\/__\//],
            },
          }),
        ]),
  ],
  server: { port: 5199 },
})
