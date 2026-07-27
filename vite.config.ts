import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Operators install the app to the home screen and run it standalone.
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
  ],
  server: { port: 5199 },
})
