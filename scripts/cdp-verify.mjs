// CDP verification harness: drives real Chrome against the emulator-backed dev
// server. Real input + real clock (virtual-time screenshots hide rAF bugs) and
// a true 390px viewport via Emulation.setDeviceMetricsOverride.
//
// Asserts per page: no horizontal scroll (docW == vpW), and 0 JS errors overall.
// Usage: node scripts/cdp-verify.mjs <out-dir>

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9345
const APP = 'http://localhost:5199/'
const OUT = process.argv[2] ?? 'cdp-out'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=' + path.join(OUT, '_cdp-profile'), 'about:blank',
], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())

let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const page = (await res.json()).find((t) => t.type === 'page')
    if (page) wsUrl = page.webSocketDebuggerUrl
  } catch { /* not up yet */ }
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
  while (Date.now() - t0 < timeoutMs) {
    if (await ev(expr)) return true
    await sleep(300)
  }
  throw new Error('timeout waiting for: ' + label)
}

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: APP })
await sleep(3000)

// ── login ────────────────────────────────────────────────────────────────────
await waitFor(`!!document.querySelector('input[type="email"], main')`, 20000, 'app booted')
const needsLogin = await ev(`!!document.querySelector('input[type="email"]')`)
console.log('login form shown:', needsLogin)
if (needsLogin) {
  // React controlled inputs need the native setter + input event
  await ev(`(function(){
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const em = document.querySelector('input[type="email"]');
    const pw = document.querySelector('input[type="password"]');
    set.call(em, 'owner@demo.test'); em.dispatchEvent(new Event('input', { bubbles: true }));
    set.call(pw, 'demo1234'); pw.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('button[type="submit"]').click();
    return true;
  })()`)
}
await waitFor(`!!document.querySelector('nav a[href="/payments"]')`, 20000, 'shell after login')
await sleep(1500) // tenant + first data settle

// ── walk the five tabs ──────────────────────────────────────────────────────
const audit = async (label) => {
  const r = JSON.parse(await ev(`JSON.stringify({
    docW: document.documentElement.scrollWidth,
    vpW: window.innerWidth,
    title: (document.querySelector('header h1') || {}).textContent || null,
  })`))
  const ok = r.docW === r.vpW
  console.log(`--- ${label} | header: ${r.title} | docW/vpW: ${r.docW}/${r.vpW} ${ok ? 'OK' : '✗ H-SCROLL'}`)
  return ok
}

const tabs = [
  ['/', 'home'],
  ['/payments', 'payments'],
  ['/analytics', 'analytics'],
  ['/calendar', 'calendar'],
  ['/customers', 'customers'],
]
let allOk = true
for (const [href, name] of tabs) {
  await ev(`(function(){ document.querySelector('nav a[href="${href}"]').click(); return true })()`)
  await sleep(2200)
  allOk = (await audit(name)) && allOk
  await shoot(`page-${name}.png`)
}

// ── errors ───────────────────────────────────────────────────────────────────
const bad = events.filter((e) =>
  e.method === 'Runtime.exceptionThrown' ||
  (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'))
console.log('\nJS errors:', bad.length)
for (const b of bad.slice(0, 8)) console.log('  ', JSON.stringify(b.params).slice(0, 300))

console.log('\nRESULT:', allOk && bad.length === 0 ? 'PASS' : 'CHECK FAILURES ABOVE')
ws.close(); chrome.kill(); process.exit(allOk && bad.length === 0 ? 0 : 1)
