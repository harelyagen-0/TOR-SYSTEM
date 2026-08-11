/**
 * Demo stand-in for `firebase/storage` (VITE_DEMO=true). Uploads are kept only
 * as an in-memory object URL so a just-attached receipt is viewable in-session.
 */
interface DemoRef {
  path: string
}

export function getStorage(): Record<string, never> {
  return {}
}
export function connectStorageEmulator(): void {
  /* no-op in demo */
}
export function ref(_storage: unknown, path: string): DemoRef {
  return { path }
}
export async function uploadBytes(refObj: DemoRef, data: Blob | Uint8Array | ArrayBuffer): Promise<{ ref: DemoRef }> {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart])
  urls.set(refObj.path, URL.createObjectURL(blob))
  return { ref: refObj }
}
export async function getDownloadURL(refObj: DemoRef): Promise<string> {
  return urls.get(refObj.path) ?? `https://demo.local/${refObj.path}`
}

const urls = new Map<string, string>()
