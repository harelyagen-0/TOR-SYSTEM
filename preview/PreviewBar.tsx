import { useEffect, useState } from 'react'
import { useAuth } from '../src/auth/AuthProvider'
import { __signInAs } from './mocks/auth'

/**
 * Preview-only chrome: a chip that swaps the signed-in operator so the
 * permission model can be seen without typing credentials. It renders OUTSIDE
 * the app's root and is not part of Studio OS.
 *
 * It sits above the bottom tab bar rather than over it — the nav is fixed at
 * bottom with z-40, so this clears it and takes a higher stacking context.
 */
const ACCOUNTS = [
  { email: 'owner@demo.test', label: 'Owner', hint: 'full access' },
  { email: 'staff@demo.test', label: 'Staff', hint: 'calendar only' },
]

export function PreviewBar() {
  const { user, role, status } = useAuth()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  // start signed in so the preview opens on content, not the login form
  useEffect(() => {
    if (status === 'signedOut' && !busy) {
      setBusy(true)
      void __signInAs('owner@demo.test').finally(() => setBusy(false))
    }
  }, [status, busy])

  async function switchTo(email: string) {
    setBusy(true)
    try { await __signInAs(email) } finally { setBusy(false); setOpen(false) }
  }

  const current = ACCOUNTS.find((a) => a.email === user?.email)

  return (
    <div
      dir="ltr"
      style={{
        position: 'fixed', insetInlineStart: '.75rem', bottom: 'calc(4.75rem + env(safe-area-inset-bottom))',
        zIndex: 60, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {open && (
        <div
          style={{
            marginBottom: '.5rem', background: 'var(--t-surface)', border: '1px solid var(--d-line)',
            borderRadius: '.75rem', padding: '.4rem', boxShadow: '0 10px 30px rgba(0,0,0,.18)',
            display: 'flex', flexDirection: 'column', gap: '.25rem', minWidth: '11.5rem',
          }}
        >
          {ACCOUNTS.map((a) => {
            const active = a.email === user?.email
            return (
              <button
                key={a.email}
                type="button"
                onClick={() => void switchTo(a.email)}
                disabled={busy}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '.05rem',
                  padding: '.45rem .6rem', borderRadius: '.5rem', border: 'none', cursor: 'pointer',
                  background: active ? 'color-mix(in srgb, var(--t-accent) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--t-accent)' : 'var(--t-text)', textAlign: 'left', font: 'inherit',
                }}
              >
                <span style={{ fontSize: '.82rem', fontWeight: 700 }}>{a.label}</span>
                <span style={{ fontSize: '.7rem', opacity: .7 }}>{a.hint}</span>
              </button>
            )
          })}
          <span style={{ fontSize: '.62rem', opacity: .55, padding: '.3rem .6rem .15rem', lineHeight: 1.35 }}>
            Preview only — data lives in this tab
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer',
          background: 'var(--t-surface)', color: 'var(--t-text)',
          border: '1px solid var(--d-line)', borderRadius: '2rem',
          padding: '.4rem .75rem .4rem .55rem', font: 'inherit', fontSize: '.78rem', fontWeight: 650,
          boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        }}
      >
        <span
          style={{
            width: '.5rem', height: '.5rem', borderRadius: '50%',
            background: role === 'owner' ? 'var(--t-accent)' : '#d97706',
          }}
        />
        {busy ? '…' : current?.label ?? 'Sign in'}
        <span style={{ opacity: .45, fontSize: '.7rem' }}>{open ? '▾' : '▴'}</span>
      </button>
    </div>
  )
}
