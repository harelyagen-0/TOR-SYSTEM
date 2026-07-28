/**
 * Staff roles and per-area permissions — the single source of truth.
 *
 * Six areas × three levels. Levels are NUMERIC in the custom claim so
 * firestore.rules can compare them ordinally (`perms.pay >= 2`); string
 * comparison would order 'edit' before 'view' alphabetically and silently
 * invert the check.
 *
 * `functions/src/permissions.ts` carries a copy of the preset table and the
 * encode/decode pair: functions/ is a separate TS package with its own
 * tsconfig and cannot import from src/. The zonedTimeToUtc helper is already
 * duplicated across three files for the same reason.
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

export const ROLES: readonly StaffRole[] = ['owner', 'manager', 'staff'] as const

/** Short keys keep the custom claim well inside Firebase's 1000-byte budget. */
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

export function levelValue(level: PermissionLevel): number {
  return LEVEL_VALUES[level] ?? 0
}

/**
 * Defaults seeded when a role is picked. The owner preset is also the LOCKED
 * permission set for the owner — the callables refuse to store anything else.
 */
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

export function can(
  perms: Permissions | null | undefined,
  area: PermissionArea,
  level: 'view' | 'edit' = 'view',
): boolean {
  if (!perms) return false
  return levelValue(perms[area] ?? 'none') >= LEVEL_VALUES[level]
}

/** Permissions → the compact numeric map stored in the custom claim. */
export function encodePermissions(perms: Permissions): Record<string, number> {
  const out: Record<string, number> = {}
  for (const area of AREAS) out[CLAIM_KEYS[area]] = levelValue(perms[area] ?? 'none')
  return out
}

/**
 * Custom claim → Permissions. Anything unrecognised decodes to 'none': a
 * malformed or absent claim must never widen access.
 */
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
