import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

/**
 * Emulator-first: in dev the app talks to the local Firebase Emulator Suite
 * (see firebase.json). Pointing at a real project later is a .env drop-in
 * (VITE_FB_* values + VITE_USE_EMULATORS=false) — no code change.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY ?? 'demo-api-key',
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN ?? 'studio-os-demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FB_PROJECT_ID ?? 'studio-os-demo',
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET ?? 'studio-os-demo.appspot.com',
  appId: import.meta.env.VITE_FB_APP_ID ?? 'demo-app-id',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

const useEmulators =
  import.meta.env.VITE_USE_EMULATORS === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS !== 'false')

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
