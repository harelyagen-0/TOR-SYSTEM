/**
 * Folds the preview build into one self-contained page for an Artifact.
 *
 * The Artifact host wraps the file in its own <!doctype>/<head>/<body>, so this
 * emits body content only: a <title>, the app's CSS, the RTL/lang setup, the
 * root node, and the bundle inline. A strict CSP blocks every external host, so
 * nothing may remain as a separate request.
 *
 * Usage: node preview/package-artifact.mjs [outfile]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIST = path.resolve(import.meta.dirname, '..', 'preview-dist')
const OUT = process.argv[2] ?? path.resolve(import.meta.dirname, '..', 'preview-dist', 'artifact.html')

const css = readFileSync(path.join(DIST, 'app.css'), 'utf8')
const js = readFileSync(path.join(DIST, 'app.js'), 'utf8')

// </script> inside the bundle would close the inline tag early
const safeJs = js.replace(/<\/script>/gi, '<\\/script>')

const html = `<title>Studio OS — interactive preview</title>
<style>
/* the app's own compiled stylesheet */
${css}
</style>
<style>
  /* the app paints its own ground; keep the host wrapper out of the way */
  html, body { margin: 0; padding: 0; background: var(--d-page); color: var(--t-text); }
</style>
<div id="root"></div>
<script>
  // Studio OS is Hebrew/RTL; the host page is neither, so set it here
  document.documentElement.setAttribute('dir', 'rtl')
  document.documentElement.setAttribute('lang', 'he')
</script>
<script type="module">
${safeJs}
</script>
`

writeFileSync(OUT, html)
console.log('wrote', OUT, (Buffer.byteLength(html) / 1048576).toFixed(2), 'MB')
