import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { BottomNav } from './BottomNav'

/**
 * Phone-first frame: pinned header, scrolling content, fixed bottom nav.
 * Wider screens get the same layout in a centred column — a graceful
 * widening, not a separate desktop design (spec §2).
 */
export function AppShell() {
  return (
    <div className="min-h-dvh bg-page">
      <Header />
      <main
        className="mx-auto w-full max-w-xl px-4 pt-4"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
