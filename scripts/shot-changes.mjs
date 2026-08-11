// Capture the three UI changes from this session as screenshots:
//  1. ProductSheet — new "סוגי שיעורים מורשים" (allowed class types) box
//  2. Yoga template pass picker — yoga subscription ENABLED
//  3. Pilates template pass picker — yoga subscription DISABLED (enforcement)
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const CHROME = '/opt/pw-browsers/chromium'
const DBG = 9357
const OUT = 'demo-out'
const DIST = path.resolve('dist')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const file = path.join(DIST, p)
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, r))
const APP = `http://127.0.0.1:${server.address().port}/`

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + path.join(OUT, '_profile3'), 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())
let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(250); try { const page = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find((t) => t.type === 'page'); if (page) wsUrl = page.webSocketDebuggerUrl } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 1; const pending = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = id++; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value }
const shoot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); console.log('wrote', name) }
const waitFor = async (expr, t = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await ev(expr)) return true; await sleep(300) } throw new Error('timeout: ' + expr) }
// click most-specific button/label within the visible dialog (or document)
const clickText = async (txt) => ev(`(function(){
  const dl=[...document.querySelectorAll('[role=dialog]:not([hidden])')];
  const root=dl.length?dl[dl.length-1]:document;
  const c=[...root.querySelectorAll('button,label,[role=button]')].filter(e=>(e.textContent||'').includes(${JSON.stringify(txt)}));
  if(!c.length) return false; c.sort((a,b)=>a.textContent.length-b.textContent.length); c[0].click(); return true;
})()`)
const setSelectByLabel = async (labelText) => ev(`(function(){
  const dl=[...document.querySelectorAll('[role=dialog]:not([hidden])')]; const root=dl.length?dl[dl.length-1]:document;
  const sel=root.querySelector('select'); if(!sel) return false;
  const opt=[...sel.options].find(o=>o.textContent.trim().includes(${JSON.stringify(labelText)})); if(!opt) return false;
  sel.value=opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return true;
})()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: APP }); await sleep(2500)
await waitFor(`!!document.querySelector('nav')`, 20000); await sleep(1000)

// ── 1. ProductSheet: new allowed-class-types box ─────────────────────────────
await ev(`(function(){ location.hash='#/payments'; return true })()`); await sleep(1600)
console.log('open new product:', await clickText('מוצר חדש'))
await sleep(1200)
// scroll the dialog so the class-types box is in view
await ev(`(function(){const d=[...document.querySelectorAll('[role=dialog]:not([hidden])')].pop(); if(d) d.scrollTop=d.scrollHeight; return true})()`)
await sleep(500)
console.log('product box present:', await ev(`document.body.innerText.includes('סוגי שיעורים מורשים')`))
await shoot('change-1-product-box.png')
// close
await ev(`(function(){const d=[...document.querySelectorAll('[role=dialog]:not([hidden])')].pop(); const b=[...d.querySelectorAll('button')].find(x=>x.textContent.trim()==='ביטול'); if(b)b.click(); return true})()`)
await sleep(800)

// ── 2 & 3. Template pass picker: yoga (enabled) vs pilates (disabled) ─────────
async function templateShot(tplTitle, classTypeLabel, file) {
  await ev(`(function(){ location.hash='#/calendar'; return true })()`); await sleep(1400)
  await clickText('תבניות שיעור'); await sleep(1000)
  await clickText(tplTitle); await sleep(1000)
  await clickText('מנויים וכרטיסיות מזכים'); await sleep(700)
  // scroll picker into view
  await ev(`(function(){const d=[...document.querySelectorAll('[role=dialog]:not([hidden])')].pop(); if(d){const el=[...d.querySelectorAll('*')].find(n=>n.textContent&&n.textContent.includes('מנויים וכרטיסיות מזכים')); (el||d).scrollIntoView&&d.scrollBy(0,300);} return true})()`)
  await sleep(500)
  const rows = await ev(`JSON.stringify([...document.querySelectorAll('[role=dialog]:not([hidden]) label')].filter(l=>l.querySelector('input[type=checkbox]')).map(l=>({t:l.textContent.trim().slice(0,45),disabled:l.querySelector('input').disabled})))`)
  console.log(file, '(' + classTypeLabel + ') rows:', rows)
  await shoot(file)
  // close sheet
  await ev(`(function(){const d=[...document.querySelectorAll('[role=dialog]:not([hidden])')].pop(); const b=[...d.querySelectorAll('button')].find(x=>x.textContent.trim()==='ביטול'); if(b)b.click(); return true})()`)
  await sleep(700)
}
await templateShot('ויניאסה בוקר', 'yoga', 'change-2-yoga-enabled.png')
await templateShot('פילאטיס מכשירים', 'pilates', 'change-3-pilates-disabled.png')

ws.close(); chrome.kill(); server.close(); process.exit(0)
