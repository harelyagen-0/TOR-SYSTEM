/**
 * Renders the toast stack from the module-level store. Fixed above the bottom
 * nav, RTL-aware, respects reduced motion. Purely presentational — content is
 * pushed from anywhere via pushToast().
 */
import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, type Toast } from '../lib/toastStore'
import { he } from '../locale/he'

const toneClass: Record<Toast['tone'], string> = {
  error: 'border-crit/30 bg-crit/10 text-crit',
  success: 'border-ok/30 bg-ok/10 text-ok',
  info: 'border-accent/30 bg-accent/10 text-accent',
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] mx-auto flex w-full max-w-xl flex-col gap-2 px-4"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-field border px-3.5 py-3 text-sm font-semibold shadow-lg backdrop-blur ${toneClass[t.tone]}`}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-bold underline underline-offset-2"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label={he.errors.dismiss}
            onClick={() => dismissToast(t.id)}
            className="shrink-0 text-base leading-none opacity-70"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
