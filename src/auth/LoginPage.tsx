import { useState, type FormEvent } from 'react'
import { he } from '../locale/he'
import { useAuth } from './AuthProvider'
import { describeError } from '../lib/errors'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // the REASON, not just the fact — an unseeded or unreachable emulator
  // must not look the same as a mistyped password
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      console.error('[studio-os] sign-in failed', err)
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-page p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-card border border-line bg-surface p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold">{he.auth.title}</h1>
        <p className="mt-1 text-sm text-muted">{he.auth.subtitle}</p>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-semibold">{he.auth.email}</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 w-full rounded-field border border-line bg-surface px-3 text-base focus:border-accent focus:outline-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-semibold">{he.auth.password}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-12 w-full rounded-field border border-line bg-surface px-3 text-base focus:border-accent focus:outline-none"
          />
        </label>

        {error && <p role="alert" className="mt-3 text-sm font-medium text-crit">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 min-h-12 w-full rounded-field bg-primary text-base font-semibold text-on-primary disabled:opacity-60"
        >
          {he.auth.signIn}
        </button>
      </form>
    </div>
  )
}
