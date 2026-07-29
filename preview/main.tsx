/**
 * Entry point for the offline artifact preview.
 *
 * Identical to src/main.tsx except that it hydrates the in-memory Firebase
 * mocks from the dumped seed first, and renders a preview-only role switcher
 * alongside the app. No file under src/ is modified for the preview — the
 * swap happens entirely through the aliases in vite.preview.config.ts.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../src/index.css'
import App from '../src/App'
import { AuthProvider } from '../src/auth/AuthProvider'
import { __hydrate } from './mocks/firestore'
import { __hydrateUsers } from './mocks/auth'
import { PreviewBar } from './PreviewBar'
import seed from './seed-data.json'

__hydrate(seed as Parameters<typeof __hydrate>[0])
__hydrateUsers(seed.users as Parameters<typeof __hydrateUsers>[0])

const queryClient = new QueryClient({
  defaultOptions: {
    // everything is local, so keep it responsive to the mocks' notifications
    queries: { staleTime: 0, retry: 0, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <PreviewBar />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
