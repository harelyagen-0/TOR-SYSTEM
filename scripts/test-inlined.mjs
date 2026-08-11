// Load the INLINED single-file preview (the exact bytes we publish as the
// artifact) in headless Chromium and report whether it actually renders.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const CHROME = '/opt/pw-browsers/chromium'
const DBG = 9361
const FILE = process.argv[2]
const html = readFileSync(FILE)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html) })
await new Promise((r) => server.listen(0, r))
const APP = `http://127.0.0.1:${server.address().port}/`

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', '--user-data-dir=/tmp/_pw_inline', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => chrome.kill())
let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(250); try { const p = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find((t) => t.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 1; const pending = new Map(); const errs = []
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) } else if (msg.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(msg.params).slice(0, 300)); else if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') errs.push('LOG: ' + msg.params.entry.text.slice(0, 200)) }
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = id++; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value }

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: APP }); await sleep(3500)
const hasNav = await ev(`!!document.querySelector('nav')`)
const bodyLen = await ev(`document.body.innerText.length`)
const hasStudio = await ev(`document.body.innerText.includes('סטודיו') || document.body.innerText.includes('תשלומים')`)
console.log('SIZE:', (html.length / 1024).toFixed(0) + 'KB')
console.log('hasNav:', hasNav, '| bodyTextLen:', bodyLen, '| hasContent:', hasStudio)
console.log('JS errors:', errs.length)
errs.slice(0, 6).forEach((e) => console.log('  ', e))
const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('demo-out/inlined-test.png', Buffer.from(data, 'base64'))
console.log('RESULT:', hasNav && bodyLen > 50 ? 'RENDERS' : 'BLANK/BROKEN')
ws.close(); chrome.kill(); server.close(); process.exit(0)
