// Smoke test for the STANDALONE DEMO build (dist/, built with build:demo).
// Serves dist over http, drives real Chromium via CDP at 390px, auto-login +
// hash routing, walks all five tabs, asserts no horizontal scroll + 0 JS
// errors, and checks that real seeded data actually rendered. Writes shots.
//
// Usage: node scripts/demo-verify.mjs <out-dir>

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const CHROME = '/opt/pw-browsers/chromium'
const DBG = 9346
const OUT = process.argv[2] ?? 'demo-out'
const DIST = path.resolve('dist')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── static server for dist ───────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const file = path.join(DIST, p)
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, r))
const APP = `http://127.0.0.1:${server.address().port}/`
console.log('serving dist at', APP)

// ── chromium via CDP ─────────────────────────────────────────────────────────
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DBG}`, '--disable-gpu', '--no-sandbox',
  '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + path.join(OUT, '_profile'), 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())

let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250)
  try {
    const res = await fetch(`http://127.0.0.1:${DBG}/json/list`)
    const page = (await res.json()).find((t) => t.type === 'page')
    if (page) wsUrl = page.webSocketDebuggerUrl
  } catch { /* not up */ }
}
if (!wsUrl) { console.error('FAIL: no devtools endpoint'); process.exit(1) }

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 1
const pending = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id)
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
  } else if (msg.method) events.push(msg)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = id++; pending.set(i, { resolve, reject })
  ws.send(JSON.stringify({ id: i, method, params }))
})
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}
const shoot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'))
  console.log('wrote', name)
}
const waitFor = async (expr, timeoutMs = 15000, label = expr) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) { if (await ev(expr)) return true; await sleep(300) }
  throw new Error('timeout waiting for: ' + label)
}

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: APP })
await sleep(2500)

// auto-login → shell should appear without a login form
await waitFor(`!!document.querySelector('nav') || !!document.querySelector('input[type="email"]')`, 20000, 'app booted')
await waitFor(`!!document.querySelector('nav')`, 20000, 'shell (auto-login)')
await sleep(1500)

const audit = async (label) => {
  const r = JSON.parse(await ev(`JSON.stringify({
    docW: document.documentElement.scrollWidth, vpW: window.innerWidth,
    title: (document.querySelector('header h1')||{}).textContent||null,
    bodyLen: document.body.innerText.length,
  })`))
  const ok = r.docW === r.vpW
  console.log(`--- ${label} | header: ${r.title} | docW/vpW ${r.docW}/${r.vpW} ${ok ? 'OK' : '✗ H-SCROLL'} | text ${r.bodyLen}`)
  return ok
}

const tabs = [['#/', 'home'], ['#/payments', 'payments'], ['#/analytics', 'analytics'], ['#/calendar', 'calendar'], ['#/customers', 'customers']]
let allOk = true
for (const [hash, name] of tabs) {
  await ev(`(function(){ location.hash='${hash}'; return true })()`)
  await sleep(2000)
  allOk = (await audit(name)) && allOk
  await shoot(`page-${name}.png`)
}

// data sanity: seeded studio name (home header) + a seeded customer (customers)
await ev(`(function(){ location.hash='#/'; return true })()`)
await sleep(1500)
const studio = await ev(`document.body.innerText.includes('סטודיו גל')`)
await ev(`(function(){ location.hash='#/customers'; return true })()`)
await sleep(1500)
const dataChecks = JSON.parse(await ev(`JSON.stringify({
  studio: ${studio},
  customer: /נועה|שירה|דנה/.test(document.body.innerText),
  digits: /\\d/.test(document.body.innerText),
})`))
console.log('data checks:', dataChecks)

const bad = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'))
console.log('\nJS errors:', bad.length)
for (const b of bad.slice(0, 8)) console.log('  ', JSON.stringify(b.params).slice(0, 300))

const dataOk = dataChecks.studio && dataChecks.customer && dataChecks.digits
console.log('\nRESULT:', allOk && bad.length === 0 && dataOk ? 'PASS' : 'CHECK FAILURES ABOVE')
ws.close(); chrome.kill(); server.close()
process.exit(allOk && bad.length === 0 && dataOk ? 0 : 1)
