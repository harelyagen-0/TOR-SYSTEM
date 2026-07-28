/**
 * The app's single surface for "something happened that you did not ask for".
 *
 * Failures used to be swallowed: a spinner stopped and the operator was left
 * guessing whether money had moved. Every mutation now reports here, so a
 * failure is impossible to miss even when it happens after a button press.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { he } from '../locale/he'
import { describeError } from '../lib/errors'

type Tone = 'error' | 'ok'

interface Toast {
  id: number
  tone: Tone
  message: string
}

interface ToastApi {
  /** report a caught error — returns the message shown, for inline reuse */
  reportError: (err: unknown) => string
  notify: (message: string, tone?: Tone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const TONES: Record<Tone, string> = {
  error: 'border-crit/25 bg-crit text-white',
  ok: 'border-ok/25 bg-ok text-white',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((message: string, tone: Tone) => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-2), { id, tone, message }])
    return id
  }, [])

  const notify = useCallback((message: string, tone: Tone = 'ok') => { push(message, tone) }, [push])

  const reportError = useCallback((err: unknown) => {
    const message = describeError(err)
    // the raw error still reaches the console for whoever is debugging
    console.error('[studio-os]', err)
    push(message, 'error')
    return message
  }, [push])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ reportError, notify }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label={he.errors.dismiss}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-field border px-4 py-3 text-start text-sm font-semibold shadow-lg ${TONES[toast.tone]}`}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      <span aria-hidden="true" className="shrink-0 text-xs opacity-80">✕</span>
    </button>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}
