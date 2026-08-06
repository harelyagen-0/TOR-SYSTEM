/**
 * A tiny module-level toast store. It lives outside React so that both the
 * React tree (ToastHost) AND the TanStack QueryClient — created before any
 * component mounts — can push toasts through the same channel. This is what
 * lets a single MutationCache.onError surface every mutation failure in the app
 * without touching the 14 individual call sites.
 */
export type ToastTone = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
  /** optional retry action shown as a button */
  action?: { label: string; run: () => void }
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let seq = 1
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(toasts)
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l)
  l(toasts)
  return () => listeners.delete(l)
}

export function pushToast(t: Omit<Toast, 'id'>, autoDismissMs = 6000): number {
  const id = seq++
  toasts = [...toasts, { ...t, id }]
  emit()
  if (autoDismissMs > 0) {
    setTimeout(() => dismissToast(id), autoDismissMs)
  }
  return id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}
