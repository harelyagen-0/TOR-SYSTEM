import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { SettingsSheet } from './SettingsSheet'

/**
 * Phone-first frame: pinned header, scrolling content, fixed bottom nav.
 * Wider screens get the same layout in a centred column — a graceful
 * widening, not a separate desktop design (spec §2).
 */
export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-page">
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <main
        className="mx-auto w-full max-w-xl px-4 pt-4"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>
      <BottomNav />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
