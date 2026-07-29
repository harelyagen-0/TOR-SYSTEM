/**
 * Turns anything thrown by Firebase, the network or our own code into one
 * Hebrew sentence an operator can act on.
 *
 * The operator does not care which layer failed — they care whether the money
 * moved and whether to try again. Every message here answers that.
 */
import { he } from '../locale/he'

/** Firebase (Firestore / Auth / Functions) puts a stable slug on `code`. */
function codeOf(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

export function describeError(err: unknown): string {
  const code = codeOf(err).replace(/^(firestore|auth|functions)\//, '')

  switch (code) {
    // sign-in: each cause needs a different action, so they must not collapse
    // into one "login failed" — that hides an unseeded or unreachable emulator
    case 'invalid-credential':
    case 'wrong-password':
      return he.errors.badCredentials
    case 'user-not-found':
      return he.errors.noSuchUser
    case 'invalid-email':
      return he.errors.badEmail
    case 'too-many-requests':
      return he.errors.tooManyAttempts
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return he.errors.offline
    case 'permission-denied':
    case 'unauthenticated':
      return he.errors.permission
    case 'not-found':
      return he.errors.notFound
    case 'already-exists':
    case 'aborted':
      return he.errors.conflict
    case 'failed-precondition':
      return he.errors.precondition
    case 'resource-exhausted':
      return he.errors.busy
    case 'cancelled':
      return he.errors.cancelled
    default:
      return he.errors.generic
  }
}

/**
 * Swallows a rejected mutation at the call site.
 *
 * Every mutation reports its own failure through the toast (`onError`), so the
 * operator has already been told. This only stops the rejection tearing past
 * the code that clears a form or closes a sheet — on failure the sheet stays
 * open with everything still typed in it. Returns `undefined`, so any caller
 * that uses the result must check for it before continuing.
 */
export function swallow(): undefined {
  return undefined
}

/** true when retrying the very same action has a real chance of succeeding */
export function isRetryable(err: unknown): boolean {
  const code = codeOf(err).replace(/^(firestore|auth|functions)\//, '')
  return ['unavailable', 'deadline-exceeded', 'network-request-failed', 'aborted', 'resource-exhausted', 'cancelled'].includes(code)
}
