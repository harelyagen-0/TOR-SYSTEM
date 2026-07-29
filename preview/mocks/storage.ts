/**
 * In-memory stand-in for firebase/storage (artifact preview only).
 * Uploads are kept as data URLs, so a logo picked in Settings really does
 * appear in the header — it just lives in the tab, not in a bucket.
 */
const files = new Map<string, string>()

export function getStorage(): unknown { return { __storage: true } }
export function connectStorageEmulator() { /* no emulator in the preview */ }

export interface StorageReference { __path: string }
export function ref(_storage: unknown, path: string): StorageReference { return { __path: path } }

export async function uploadBytes(r: StorageReference, data: Blob) {
  const url = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(data)
  })
  files.set(r.__path, url)
  return { ref: r }
}

export async function getDownloadURL(r: StorageReference) {
  return files.get(r.__path) ?? ''
}
