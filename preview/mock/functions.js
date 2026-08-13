// Callable functions resolve to a success no-op (e.g. resend report).
export function getFunctions() { return {} }
export function connectFunctionsEmulator() {}
export function httpsCallable() { return async () => ({ data: { ok: true } }) }
