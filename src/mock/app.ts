/** `firebase/app` stand-in for the preview build. */
import './seed' // seed the in-memory store on first load

export function initializeApp(_config?: unknown) { return {} }
