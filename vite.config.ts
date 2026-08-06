import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Fail the build loudly if a manifest-referenced icon is missing, rather than
// shipping a manifest full of 404s (the whole point of a PWA is the icon).
const REQUIRED_ICONS = [
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-512-maskable.png',
  'public/icons/apple-touch-icon.png',
]
function assertIcons(): Plugin {
  return {
    name: 'assert-pwa-icons',
    buildStart() {
      const root = fileURLToPath(new URL('.', import.meta.url))
      const missing = REQUIRED_ICONS.filter((p) => !existsSync(root + p))
      if (missing.length) {
        this.error(
          `Missing PWA icons: ${missing.join(', ')}. Run \`python3 scripts/gen-icons.py\`.`,
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    assertIcons(),
    react(),
    tailwindcss(),
    // Operators install the app to the home screen and run it standalone.
    VitePWA({
      // `prompt`, not `autoUpdate`: a new service worker waits instead of
      // taking over mid-payment; it activates on the next cold start. A
      // future "new version available" banner can call the register hook.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
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
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app is useless without live data; only the shell is cached.
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
  server: { port: 5199 },
})
