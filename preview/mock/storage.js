// No-op storage: uploads resolve to a placeholder URL (attachments aren't
// exercised in the preview).
export function getStorage() { return {} }
export function connectStorageEmulator() {}
export function ref(_s, path) { return { path } }
export async function uploadBytes(r) { return { ref: r } }
export async function getDownloadURL() { return 'about:blank' }
