import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import type { PermissionArea } from './auth/permissions'
import { LoginPage } from './auth/LoginPage'
import { TenantProvider } from './tenant/TenantProvider'
import { AppShell } from './components/AppShell'
import { he } from './locale/he'
import { HomePage } from './pages/home/HomePage'
import { PaymentsPage } from './pages/payments/PaymentsPage'
import { AnalyticsPage } from './pages/analytics/AnalyticsPage'
import { CalendarPage } from './pages/calendar/CalendarPage'
import { CustomersPage } from './pages/customers/CustomersPage'
import { SettingsPage } from './pages/settings/SettingsPage'

/**
 * Sends an operator home rather than showing a page they can't read. Accepts
 * several areas because one page can host more than one (payments also carries
 * the expenses and accountant-report tiles, which are `finance`).
 *
 * This mirrors firestore.rules — it is not the security boundary; the data is
 * denied server-side regardless.
 */
function RequireArea({
  area,
  children,
}: {
  area: PermissionArea | PermissionArea[]
  children: ReactNode
}) {
  const { can } = useAuth()
  const areas = Array.isArray(area) ? area : [area]
  if (!areas.some((a) => can(a, 'view'))) return <Navigate to="/" replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '/payments',
        element: (
          <RequireArea area={['payments', 'finance']}>
            <PaymentsPage />
          </RequireArea>
        ),
      },
      { path: '/analytics', element: <RequireArea area="analytics"><AnalyticsPage /></RequireArea> },
      { path: '/calendar', element: <RequireArea area="calendar"><CalendarPage /></RequireArea> },
      { path: '/customers', element: <RequireArea area="customers"><CustomersPage /></RequireArea> },
      // always reachable: it carries the account card and the sign-out control
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
])

export default function App() {
  const { status, tenantId } = useAuth()

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm font-medium text-muted">{he.common.loading}</p>
      </div>
    )
  }
  if (status === 'signedOut') return <LoginPage />
  if (status === 'noTenant' || !tenantId) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <p className="text-sm font-medium text-muted">{he.auth.noTenant}</p>
      </div>
    )
  }
  return (
    <TenantProvider tenantId={tenantId}>
      <RouterProvider router={router} />
    </TenantProvider>
  )
}
