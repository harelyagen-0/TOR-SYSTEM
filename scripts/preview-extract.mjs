/**
 * Post-processes the single-file preview build (dist-preview/index.html) into a
 * body-only fragment (dist-preview/artifact.html) suitable for hosting where the
 * host supplies the <!doctype>/<html>/<head>/<body> skeleton. Pulls the inlined
 * <style> + app <script> and forces the app's RTL/Hebrew context at runtime.
 *
 * Run via: npm run build:preview
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(root, 'dist-preview/index.html'), 'utf8')

const styles = [...src.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0])
const scripts = [...src.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0])
if (!styles.length) throw new Error('no <style> found in build')
if (!scripts.length) throw new Error('no <script> found in build')

const fragment = `<title>Studio OS — live preview</title>
${styles.join('\n')}
<style>
  html, body { height: 100%; margin: 0; background: #f4f5f8; }
  #root { min-height: 100dvh; }
</style>
<div id="root" dir="rtl" lang="he"></div>
<script>
  document.documentElement.setAttribute('dir', 'rtl')
  document.documentElement.setAttribute('lang', 'he')
</script>
${scripts.join('\n')}
`

writeFileSync(resolve(root, 'dist-preview/artifact.html'), fragment)
console.log('wrote dist-preview/artifact.html', (fragment.length / 1024).toFixed(0) + 'KB')
