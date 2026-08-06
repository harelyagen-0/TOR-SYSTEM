/**
 * Bootstraps the FIRST vendor admin (the only claim provisionTenant can't mint
 * for itself). Run this once against the real project, then everything else —
 * creating tenants, adding operators — goes through the provisionTenant /
 * addOperator callables.
 *
 * Usage:
 *   # against the emulator (default):
 *   node scripts/grant-admin.mjs owner@vendor.test
 *   # against a real project (needs GOOGLE_APPLICATION_CREDENTIALS):
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/grant-admin.mjs you@vendor.com
 *
 * The user must already exist in Firebase Auth (sign them up first).
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const email = process.argv[2]
if (!email) {
  console.error('usage: node scripts/grant-admin.mjs <email>')
  process.exit(1)
}

// default to the emulator unless the caller cleared these
if (process.env.FIREBASE_AUTH_EMULATOR_HOST === undefined && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'studio-os-demo' })
const auth = getAuth()

const user = await auth.getUserByEmail(email)
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), vendorAdmin: true })
console.log(`granted vendorAdmin to ${email} (${user.uid})`)
console.log('they must sign out/in (or refresh their ID token) for the claim to take effect')
