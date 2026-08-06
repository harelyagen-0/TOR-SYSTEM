import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastHost } from './components/ToastHost'
import { errorToHebrew, isOfflineError } from './lib/appError'
import { pushToast } from './lib/toastStore'

/**
 * A single MutationCache/QueryCache error handler surfaces every failure in the
 * app as a Hebrew toast — no per-call-site error handling needed. Offline
 * mutation failures are expected (Firestore queues the write), so they get a
 * calmer "saved, will sync" note rather than an error.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isOfflineError(error)) {
        pushToast({ tone: 'info', message: errorToHebrew(error) })
      } else {
        pushToast({ tone: 'error', message: errorToHebrew(error) })
      }
    },
  }),
  queryCache: new QueryCache({
    onError: (error) => {
      // don't nag on background refetch flaps; only real failures
      if (!isOfflineError(error)) {
        pushToast({ tone: 'error', message: errorToHebrew(error) })
      }
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <ToastHost />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
