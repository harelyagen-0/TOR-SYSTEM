/**
 * Server-side copy of the role/permission table.
 *
 * MUST stay in sync with src/auth/permissions.ts. functions/ is a separate TS
 * package with its own tsconfig and cannot import from src/ — the same reason
 * zonedTimeToUtc is duplicated across three files in this repo.
 */

export type StaffRole = 'owner' | 'manager' | 'staff'

export type PermissionArea =
  | 'payments'
  | 'customers'
  | 'calendar'
  | 'analytics'
  | 'finance'
  | 'settings'

export type PermissionLevel = 'none' | 'view' | 'edit'

export type Permissions = Record<PermissionArea, PermissionLevel>

export const AREAS: readonly PermissionArea[] = [
  'payments',
  'customers',
  'calendar',
  'analytics',
  'finance',
  'settings',
] as const

export const CLAIM_KEYS: Record<PermissionArea, string> = {
  payments: 'pay',
  customers: 'cus',
  calendar: 'cal',
  analytics: 'ana',
  finance: 'fin',
  settings: 'set',
}

const LEVEL_VALUES: Record<PermissionLevel, number> = { none: 0, view: 1, edit: 2 }
const LEVELS_BY_VALUE: PermissionLevel[] = ['none', 'view', 'edit']

export const ROLE_PRESETS: Record<StaffRole, Permissions> = {
  owner: {
    payments: 'edit',
    customers: 'edit',
    calendar: 'edit',
    analytics: 'edit',
    finance: 'edit',
    settings: 'edit',
  },
  manager: {
    payments: 'edit',
    customers: 'edit',
    calendar: 'edit',
    analytics: 'view',
    finance: 'view',
    settings: 'none',
  },
  staff: {
    payments: 'none',
    customers: 'view',
    calendar: 'edit',
    analytics: 'none',
    finance: 'none',
    settings: 'none',
  },
}

export const NO_PERMISSIONS: Permissions = {
  payments: 'none',
  customers: 'none',
  calendar: 'none',
  analytics: 'none',
  finance: 'none',
  settings: 'none',
}

export function encodePermissions(perms: Permissions): Record<string, number> {
  const out: Record<string, number> = {}
  for (const area of AREAS) out[CLAIM_KEYS[area]] = LEVEL_VALUES[perms[area] ?? 'none'] ?? 0
  return out
}

export function decodePermissions(claim: unknown): Permissions {
  const source = (claim ?? {}) as Record<string, unknown>
  const out = { ...NO_PERMISSIONS }
  for (const area of AREAS) {
    const raw = source[CLAIM_KEYS[area]]
    if (typeof raw === 'number' && raw >= 0 && raw < LEVELS_BY_VALUE.length) {
      out[area] = LEVELS_BY_VALUE[raw]
    }
  }
  return out
}

export function isStaffRole(value: unknown): value is StaffRole {
  return value === 'owner' || value === 'manager' || value === 'staff'
}

/**
 * Coerces arbitrary client input into a valid Permissions object. Unknown
 * areas are dropped and unknown levels fall back to 'none' — a caller can
 * never smuggle an unexpected key into the claim.
 */
export function sanitisePermissions(input: unknown, fallback: Permissions): Permissions {
  if (!input || typeof input !== 'object') return { ...fallback }
  const source = input as Record<string, unknown>
  const out = { ...NO_PERMISSIONS }
  for (const area of AREAS) {
    const raw = source[area]
    out[area] = raw === 'view' || raw === 'edit' || raw === 'none' ? raw : fallback[area]
  }
  return out
}
