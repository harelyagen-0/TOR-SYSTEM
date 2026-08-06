/** `firebase/storage` stand-in for the preview build (receipt uploads no-op). */
export function getStorage() { return {} }
export function connectStorageEmulator() { /* no-op */ }
export function ref(_s: unknown, path: string) { return { path } }
export async function uploadBytes(_ref: unknown, _data: unknown) {
  await new Promise((r) => setTimeout(r, 50))
  return {}
}
export async function getDownloadURL(_ref: unknown) {
  // real uploads aren't persisted in the preview; return a harmless placeholder
  return 'data:text/plain,receipt'
}
