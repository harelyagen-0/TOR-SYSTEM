// One-off: drive the demo to the class-template pass picker for the PILATES
// template and screenshot it, to confirm ineligible passes render disabled.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const CHROME = '/opt/pw-browsers/chromium'
const DBG = 9351
const OUT = 'demo-out'
const DIST = path.resolve('dist')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + path.join(OUT, '_profile2'), 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())

let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250)
  try { const page = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find((t) => t.type === 'page'); if (page) wsUrl = page.webSocketDebuggerUrl } catch {}
}
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 1; const pending = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) } }
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = id++; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value }
const shoot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); console.log('wrote', name) }
const waitFor = async (expr, t = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await ev(expr)) return true; await sleep(300) } throw new Error('timeout: ' + expr) }
// click the MOST SPECIFIC button/label whose text contains `txt`
// (shortest matching textContent → avoids clicking a big wrapper container)
const clickText = async (txt) => ev(`(function(){
  const dialogs=[...document.querySelectorAll('[role=dialog]:not([hidden])')];
  const root=dialogs.length?dialogs[dialogs.length-1]:document;
  const cands=[...root.querySelectorAll('button,label,[role=button]')]
    .filter(e=>(e.textContent||'').includes(${JSON.stringify(txt)}));
  if(!cands.length) return false;
  cands.sort((a,b)=>a.textContent.length-b.textContent.length);
  cands[0].click(); return true;
})()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: APP })
await sleep(2500)
await waitFor(`!!document.querySelector('nav')`, 20000)
await sleep(1200)

// go to calendar
await ev(`(function(){ location.hash='#/calendar'; return true })()`)
await sleep(1800)
// open templates sheet
console.log('open manageTemplates:', await clickText('תבניות שיעור'))
await sleep(1200)
// open the pilates template
console.log('open pilates tpl:', await clickText('פילאטיס מכשירים'))
await sleep(1400)
await shoot('step-after-pilates.png')
console.log('BUTTONS NOW:', await ev(`JSON.stringify([...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,40)).filter(Boolean))`))
console.log('has classType select:', await ev(`!!document.querySelector('select')`))
// expand the passes picker
console.log('expand passes:', await clickText('מנויים וכרטיסיות מזכים'))
await sleep(1000)
// report what the picker shows
const rows = await ev(`JSON.stringify([...document.querySelectorAll('label')].filter(l=>l.querySelector('input[type=checkbox]')).map(l=>({t:l.textContent.trim().slice(0,60), disabled: l.querySelector('input').disabled})))`)
console.log('PICKER ROWS:', rows)
await shoot('templates-pilates-passes.png')

ws.close(); chrome.kill(); server.close(); process.exit(0)
