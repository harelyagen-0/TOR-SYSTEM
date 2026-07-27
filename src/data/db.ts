/**
 * Typed access to tenant subcollections. Every read/write goes through here,
 * so the tenant scoping (`tenants/{tenantId}/…`) exists in exactly one place.
 */
import {
  collection,
  doc,
  type CollectionReference,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type CollectionName =
  | 'customers'
  | 'products'
  | 'payments'
  | 'invoices'
  | 'entitlements'
  | 'subscriptions'
  | 'promoCodes'
  | 'expenses'
  | 'instructors'
  | 'classTemplates'
  | 'recurrences'
  | 'sessions'
  | 'registrations'
  | 'ledger'
  | 'reports'
  | 'counters'

function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(value: T): DocumentData {
      const { id: _id, ...rest } = value
      return rest
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      return { ...(snapshot.data() as Omit<T, 'id'>), id: snapshot.id } as T
    },
  }
}

export function tenantCol<T extends { id: string }>(
  tenantId: string,
  name: CollectionName,
): CollectionReference<T> {
  return collection(db, 'tenants', tenantId, name).withConverter(converter<T>())
}

export function tenantDoc(tenantId: string) {
  return doc(db, 'tenants', tenantId)
}

/**
 * Untyped collection ref for WRITES (serverTimestamp() and other FieldValue
 * sentinels don't fit the read-side document types).
 */
export function rawCol(tenantId: string, name: CollectionName) {
  return collection(db, 'tenants', tenantId, name)
}
