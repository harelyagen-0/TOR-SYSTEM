/** Demo stand-in for `firebase/functions` (VITE_DEMO=true). */
import { compileAndSendReport } from './firestore'

export function getFunctions(): Record<string, never> {
  return {}
}
export function connectFunctionsEmulator(): void {
  /* no-op in demo */
}
export function httpsCallable(_functions: unknown, name: string) {
  return async (payload?: { period?: string }) => {
    if (name === 'resendReport' && payload?.period) {
      compileAndSendReport('demo-yoga', payload.period)
      return { data: { ok: true } }
    }
    return { data: {} }
  }
}
