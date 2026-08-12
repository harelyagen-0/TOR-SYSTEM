import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
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

// The standalone demo build (VITE_DEMO) uses hash routing so it runs correctly
// when served from any path (static host / preview) without server rewrites.
const createRouter = import.meta.env.VITE_DEMO === 'true' ? createHashRouter : createBrowserRouter

const router = createRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/payments', element: <PaymentsPage /> },
      { path: '/analytics', element: <AnalyticsPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/customers', element: <CustomersPage /> },
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
