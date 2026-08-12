// Inline the demo build (dist/) into ONE self-contained HTML file.
//
// IMPORTANT: the JS/CSS are passed to replace() via a FUNCTION, not a string.
// String replacements interpret `$\`` / `$'` / `$&` as special patterns, and
// the minified bundle contains `$\`` sequences — using a string replacement
// duplicates the page skeleton and produces invalid HTML (blank page).
//
// Usage: node scripts/inline-demo.mjs <dist-dir> <out-file>
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const DIST = process.argv[2] ?? 'dist'
const OUT = process.argv[3]
if (!OUT) { console.error('usage: node scripts/inline-demo.mjs <dist> <out.html>'); process.exit(1) }

const assets = readdirSync(path.join(DIST, 'assets'))
const js = readFileSync(path.join(DIST, 'assets', assets.find((f) => f.endsWith('.js'))), 'utf8')
const css = readFileSync(path.join(DIST, 'assets', assets.find((f) => f.endsWith('.css'))), 'utf8')
let html = readFileSync(path.join(DIST, 'index.html'), 'utf8')

// strip external references to the built assets
html = html
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '')
  .replace(/<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/g, '')
  .replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '')

// guard: a literal </script> inside the bundle would close the inline tag early
const safeJs = js.replace(/<\/script>/gi, '<\\/script>')

// function replacements → `$` in css/js is treated literally
html = html.replace('</head>', () => `<style>${css}</style></head>`)
html = html.replace('</body>', () => `<script type="module">${safeJs}</script></body>`)

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log('wrote', OUT, (html.length / 1024).toFixed(0) + 'KB')
