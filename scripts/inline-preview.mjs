// Inlines dist-preview/{app.js,app.css} into two artifacts:
//   preview-standalone.html  — full HTML doc (for local file:// verification)
//   preview-artifact.html    — content-only (for the Artifact publisher, which
//                              supplies its own <!doctype>/<head>/<body>)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] || 'dist-preview'
const outDir = process.argv[3] || '.'
const js = readFileSync(path.join(dir, 'app.js'), 'utf8').replaceAll('</script', '<\\/script')
const css = readFileSync(path.join(dir, 'app.css'), 'utf8').replaceAll('</style', '<\\/style')

const dirFix = `document.documentElement.setAttribute('dir','rtl');document.documentElement.setAttribute('lang','he');`

const content = `<script>${dirFix}</script>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>`

writeFileSync(path.join(outDir, 'preview-artifact.html'), content)

const standalone = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><title>Studio OS — Live Preview</title>
<style>${css}</style></head>
<body><div id="root"></div><script type="module">${js}</script></body>
</html>`
writeFileSync(path.join(outDir, 'preview-standalone.html'), standalone)

console.log('wrote preview-artifact.html and preview-standalone.html; content bytes:', Buffer.byteLength(content))
