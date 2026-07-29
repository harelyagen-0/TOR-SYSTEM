/**
 * Drives the packaged artifact page in real Chrome and asserts the app boots,
 * the role switch actually re-renders the permission gating, and the settings
 * sheets open — with no console errors and no horizontal scroll at 390px.
 *
 * Usage: CHROME_PATH=... node preview/verify-artifact.mjs <artifact.html> [outdir]
 */
import { spawn } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9371
const FILE = process.argv[2]
const OUT = process.argv[3] ?? path.resolve(import.meta.dirname, '..', 'preview-dist')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// wrap exactly as the Artifact host does
const wrapped = path.join(OUT, '_wrapped.html')
writeFileSync(wrapped,
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>*{margin:0}</style></head><body>' + readFileSync(FILE, 'utf8') + '</body></html>')

const sandbox = process.env.CHROME_PATH ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--hide-scrollbars', '--no-first-run', ...sandbox,
  '--user-data-dir=' + path.join(OUT, '_verify-profile'), 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())

let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250)
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const p = (await r.json()).find((t) => t.type === 'page')
    if (p) wsUrl = p.webSocketDebuggerUrl
  } catch { /* not up yet */ }
}
if (!wsUrl) { console.error('FAIL: no devtools endpoint'); process.exit(1) }

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id)
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
    else p.resolve(msg.result)
  } else events.push(msg)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }))
})
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result?.value
}
const shoot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: false })
  writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'))
  console.log('   shot', name)
}

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'file://' + wrapped })
await sleep(5000)

let fails = 0
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!cond) fails++
}

const state = () => ev(`JSON.stringify({
  tabs: [...document.querySelectorAll('nav a')].map(a => a.getAttribute('href')),
  gear: !!document.querySelector('header a[href$="/settings"]'),
  title: (document.querySelector('header h1')||{}).textContent || null,
  quick: [...document.querySelectorAll('main section:first-of-type button')].map(b => b.textContent.trim()),
  sections: [...document.querySelectorAll('main section h2')].map(h => h.textContent.trim()),
  docW: document.documentElement.scrollWidth, vpW: window.innerWidth,
  chip: (document.querySelector('[aria-expanded]')||{}).textContent || null,
})`)

/**
 * Tailwind generates utilities by scanning the Vite root; get that wrong and
 * the app renders with almost no CSS while every DOM assertion still passes.
 * These probe computed style, so a stylesheet regression fails loudly.
 */
const styleProbe = () => ev(`JSON.stringify((function(){
  const nav = document.querySelector('nav');
  const navBox = nav && document.querySelector('nav > div');
  const header = document.querySelector('header');
  const cs = nav ? getComputedStyle(nav) : null;
  return {
    navFixed: cs ? cs.position : null,
    navCols: navBox ? getComputedStyle(navBox).gridTemplateColumns : null,
    headerSticky: header ? getComputedStyle(header).position : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    // did a Tailwind utility actually get generated? (rounded-card = .875rem)
    // counting cssRules is useless here — v4 nests everything inside @layer
    cardRadius: (function(){
      const c = document.querySelector('.rounded-card');
      return c ? getComputedStyle(c).borderTopLeftRadius : null;
    })(),
    themeVar: getComputedStyle(document.documentElement).getPropertyValue('--t-primary').trim(),
  }
})())`)

// ── owner ──────────────────────────────────────────────────────────────────
console.log('\n— owner —')
let s = JSON.parse(await state())
check('app booted and auto-signed in', s.title !== null, `header: ${s.title}`)
check('five tabs', s.tabs.length === 5, s.tabs.join(' '))
check('settings gear present', s.gear === true)
check('four quick actions', s.quick.length === 4, s.quick.join(' | '))
check('no horizontal scroll', s.docW === s.vpW, `${s.docW}/${s.vpW}`)

const st = JSON.parse(await styleProbe())
check('tailwind utilities generated', st.cardRadius === '14px', `rounded-card → ${st.cardRadius}`)
check('tenant theme vars applied', st.themeVar !== '', `--t-primary: ${st.themeVar}`)
check('bottom nav is fixed', st.navFixed === 'fixed', String(st.navFixed))
check('nav lays out as 5 columns', (st.navCols || '').split(' ').length === 5, String(st.navCols))
check('header is sticky', st.headerSticky === 'sticky', String(st.headerSticky))
await shoot('verify-owner-home.jpg')

// settings hub + a sheet
await ev(`document.querySelector('header a[href$="/settings"]').click()`)
await sleep(1500)
s = JSON.parse(await state())
check('owner settings has both sections', s.sections.length === 2, s.sections.join(' | '))
await shoot('verify-owner-settings.jpg')

await ev(`document.querySelectorAll('main section:first-of-type button')[3].click()`)
await sleep(1500)
// every sheet stays mounted and is merely [hidden], so scope to the open one
const staffSheet = JSON.parse(await ev(`JSON.stringify((function(){
  const d = document.querySelector('[role="dialog"]:not([hidden])');
  return {
    title: d ? (d.querySelector('h2')||{}).textContent : null,
    rows: d ? [...d.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 4) : [],
  }
})())`))
check('the STAFF sheet is the one open', staffSheet.title === 'צוות והרשאות', `title: ${staffSheet.title}`)
check('roster lists both demo accounts',
  staffSheet.rows.some((r) => r.includes('owner@demo.test')) && staffSheet.rows.some((r) => r.includes('staff@demo.test')),
  staffSheet.rows.join(' | '))
await shoot('verify-owner-staff-sheet.jpg')

// ── switch to staff ────────────────────────────────────────────────────────
console.log('\n— switch to staff —')
await ev(`(function(){ const d=document.querySelector('[role="dialog"]'); if(d&&d.previousElementSibling) d.previousElementSibling.click(); return true })()`)
await sleep(600)
await ev(`document.querySelector('[aria-expanded]').click()`)
await sleep(600)
const switched = await ev(`(function(){
  const bs = [...document.querySelectorAll('button')].filter(b => /Staff/.test(b.textContent) && /calendar only/.test(b.textContent));
  if (!bs.length) return false; bs[0].click(); return true })()`)
check('role switcher found the staff account', switched === true)
await sleep(3000)

s = JSON.parse(await state())
check('three tabs', s.tabs.length === 3, s.tabs.join(' '))
check('payments tab gone', !s.tabs.some(h => h.endsWith('/payments')))
check('analytics tab gone', !s.tabs.some(h => h.endsWith('/analytics')))
check('no horizontal scroll', s.docW === s.vpW, `${s.docW}/${s.vpW}`)
await shoot('verify-staff-home.jpg')

await ev(`document.querySelector('header a[href$="/settings"]').click()`)
await sleep(1500)
s = JSON.parse(await state())
check('staff settings shows account only', s.sections.length === 1, s.sections.join(' | '))
await shoot('verify-staff-settings.jpg')

// direct navigation to a blocked route must bounce home
await ev("location.hash = '#/payments'")
await sleep(2500)
const landed = await ev("location.hash || '#/'")
check('/payments redirects home for staff', landed === '#/' || landed === '', 'landed on ' + landed)

// ── back to owner ──────────────────────────────────────────────────────────
console.log('\n— back to owner —')
await ev(`document.querySelector('[aria-expanded]').click()`)
await sleep(600)
await ev(`(function(){
  const bs = [...document.querySelectorAll('button')].filter(b => /Owner/.test(b.textContent) && /full access/.test(b.textContent));
  if (bs.length) bs[0].click(); return true })()`)
await sleep(3000)
s = JSON.parse(await state())
check('five tabs restored', s.tabs.length === 5, s.tabs.join(' '))

const bad = events.filter((e) => e.method === 'Runtime.exceptionThrown' ||
  (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'))
console.log('\nconsole errors:', bad.length)
for (const b of bad.slice(0, 8)) console.log('  ', JSON.stringify(b.params).slice(0, 260))
if (bad.length) fails++

console.log(`\nRESULT: ${fails === 0 ? 'PASS' : fails + ' CHECK(S) FAILED'}`)
ws.close(); chrome.kill(); process.exit(fails === 0 ? 0 : 1)
