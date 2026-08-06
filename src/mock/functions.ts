/** `firebase/functions` stand-in for the preview build. */
import { compileAndSendReport } from './store'

export function getFunctions() { return {} }
export function connectFunctionsEmulator() { /* no-op */ }

export function httpsCallable(_fns: unknown, name: string) {
  return async (payload?: { period?: string }) => {
    await new Promise((r) => setTimeout(r, 200))
    if (name === 'resendReport' && payload?.period) {
      compileAndSendReport('demo-yoga', payload.period)
    }
    return { data: { ok: true } }
  }
}
