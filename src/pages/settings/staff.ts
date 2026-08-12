/**
 * Staff role + permission catalogues for the staff settings sheet. Kept in a
 * component-free module so the sheet file stays component-only for fast refresh.
 */
import { he } from '../../locale/he'
import type { StaffPermission, StaffRole } from '../../types/models'

export const STAFF_ROLES: { key: StaffRole; label: string }[] = [
  { key: 'owner', label: he.settings.roleOwner },
  { key: 'manager', label: he.settings.roleManager },
  { key: 'instructor', label: he.settings.roleInstructor },
  { key: 'frontdesk', label: he.settings.roleFrontdesk },
]

export const STAFF_PERMISSIONS: { key: StaffPermission; label: string }[] = [
  { key: 'payments', label: he.settings.permPayments },
  { key: 'calendar', label: he.settings.permCalendar },
  { key: 'customers', label: he.settings.permCustomers },
  { key: 'reports', label: he.settings.permReports },
  { key: 'settings', label: he.settings.permSettings },
]

export function roleLabel(role: StaffRole): string {
  return STAFF_ROLES.find((r) => r.key === role)?.label ?? role
}
