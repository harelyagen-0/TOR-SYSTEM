/**
 * Maps thrown errors (Firebase SDK `FirebaseError`, callable `HttpsError`,
 * network failures) to a Hebrew message token. The whole app funnels mutation
 * and query failures through here so the operator always sees something real
 * instead of a silent, cleared form.
 */
import { he } from '../locale/he'

interface CodedError {
  code?: string
  message?: string
}

/** Firestore/Auth/Functions all put a string `code` on the error. */
function codeOf(err: unknown): string {
  const c = (err as CodedError)?.code
  return typeof c === 'string' ? c : ''
}

export function isOfflineError(err: unknown): boolean {
  const code = codeOf(err)
  return (
    code === 'unavailable' ||
    code === 'functions/unavailable' ||
    (typeof navigator !== 'undefined' && !navigator.onLine)
  )
}

export function errorToHebrew(err: unknown): string {
  const code = codeOf(err)
  if (isOfflineError(err)) return he.errors.offline
  if (code.includes('permission-denied')) return he.errors.permission
  if (code.includes('unauthenticated')) return he.errors.unauthenticated
  if (code.includes('not-found')) return he.errors.notFound
  if (code.includes('already-exists') || code.includes('aborted')) return he.errors.conflict
  // callable errors carry a `details.reason` we can surface verbatim
  const details = (err as { details?: { reason?: string } })?.details
  if (details?.reason === 'payment-failed') return he.errors.paymentFailed
  return he.errors.generic
}
