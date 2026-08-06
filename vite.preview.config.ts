import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const mock = (f: string) => resolve(here, 'src/mock', f)

/**
 * Standalone PREVIEW build: the real app, with the Firebase SDK aliased to the
 * in-memory backend in src/mock/ so it runs anywhere with no server. Output is
 * a single self-contained HTML file (viteSingleFile) suitable for hosting as
 * an Artifact. The shipping app is unchanged — this config is preview-only.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: 'react-router-dom', replacement: mock('router.ts') },
      { find: 'firebase/app', replacement: mock('app.ts') },
      { find: 'firebase/auth', replacement: mock('auth.ts') },
      { find: 'firebase/firestore', replacement: mock('firestore.ts') },
      { find: 'firebase/functions', replacement: mock('functions.ts') },
      { find: 'firebase/storage', replacement: mock('storage.ts') },
    ],
  },
  build: {
    outDir: 'dist-preview',
    // preview only; skip the sourcemaps + a lower target that bloats the inline
    target: 'es2022',
    minify: 'esbuild',
  },
})
