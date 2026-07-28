/**
 * Server-side copy of the role/permission table.
 *
 * MUST stay in sync with src/auth/permissions.ts. functions/ is a separate TS
 * package with its own tsconfig and cannot import from src/ — the same reason
 * zonedTimeToUtc is duplicated across three files in this repo.
 */
export const AREAS = [
    'payments',
    'customers',
    'calendar',
    'analytics',
    'finance',
    'settings',
];
export const CLAIM_KEYS = {
    payments: 'pay',
    customers: 'cus',
    calendar: 'cal',
    analytics: 'ana',
    finance: 'fin',
    settings: 'set',
};
const LEVEL_VALUES = { none: 0, view: 1, edit: 2 };
const LEVELS_BY_VALUE = ['none', 'view', 'edit'];
export const ROLE_PRESETS = {
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
};
export const NO_PERMISSIONS = {
    payments: 'none',
    customers: 'none',
    calendar: 'none',
    analytics: 'none',
    finance: 'none',
    settings: 'none',
};
export function encodePermissions(perms) {
    const out = {};
    for (const area of AREAS)
        out[CLAIM_KEYS[area]] = LEVEL_VALUES[perms[area] ?? 'none'] ?? 0;
    return out;
}
export function decodePermissions(claim) {
    const source = (claim ?? {});
    const out = { ...NO_PERMISSIONS };
    for (const area of AREAS) {
        const raw = source[CLAIM_KEYS[area]];
        if (typeof raw === 'number' && raw >= 0 && raw < LEVELS_BY_VALUE.length) {
            out[area] = LEVELS_BY_VALUE[raw];
        }
    }
    return out;
}
export function isStaffRole(value) {
    return value === 'owner' || value === 'manager' || value === 'staff';
}
/**
 * Coerces arbitrary client input into a valid Permissions object. Unknown
 * areas are dropped and unknown levels fall back to 'none' — a caller can
 * never smuggle an unexpected key into the claim.
 */
export function sanitisePermissions(input, fallback) {
    if (!input || typeof input !== 'object')
        return { ...fallback };
    const source = input;
    const out = { ...NO_PERMISSIONS };
    for (const area of AREAS) {
        const raw = source[area];
        out[area] = raw === 'view' || raw === 'edit' || raw === 'none' ? raw : fallback[area];
    }
    return out;
}
//# sourceMappingURL=permissions.js.map