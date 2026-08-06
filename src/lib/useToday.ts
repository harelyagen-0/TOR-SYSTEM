/**
 * A `now` that stays current. A PWA left open overnight otherwise shows
 * yesterday's date and yesterday's schedule (P4-9): the header, the home
 * screen's "today", and the calendar's current-week all read a Date captured
 * once on mount. This hook re-renders at the next studio-timezone midnight and
 * whenever the tab is refocused (background timers are throttled).
 */
import { useEffect, useState } from 'react'

export function useToday(_tz: string): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Re-check on the hour: cheap, and it always advances `now` across the
    // midnight boundary within the hour (the date-derived values downstream
    // recompute from it). Exact-midnight scheduling isn't worth the DST edges.
    const tick = () => {
      const current = new Date()
      setNow(current)
      const msToNextHour = 3600_000 - (current.getTime() % 3600_000)
      timer = setTimeout(tick, msToNextHour)
    }
    let timer = setTimeout(tick, 3600_000 - (Date.now() % 3600_000))

    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return now
}
