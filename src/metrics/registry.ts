/**
 * Pluggable metric registry (spec §11). Adding a metric later means adding ONE
 * entry here — never touching page layout. [OPEN]: the real metric list is
 * Jimmy's; these four starters are the ones Home also shows.
 */
import { getCountFromServer, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { tenantCol } from '../data/db'
import { formatMoney, monthKey, weekStartKey, zonedTimeToUtc, addDaysKey } from '../lib/format'
import { he } from '../locale/he'
import type { LedgerLine, Registration } from '../types/models'

export interface MetricContext {
  tenantId: string
  tz: string
  currency: string
  locale: string
  now: Date
}

export interface MetricResult {
  value: string
  sub?: string
}

export interface MetricDef {
  id: string
  label: string
  compute: (ctx: MetricContext) => Promise<MetricResult>
}

export const metricRegistry: MetricDef[] = [
  {
    id: 'revenueMtd',
    label: he.metrics.revenueMtd,
    async compute({ tenantId, tz, currency, locale, now }) {
      const period = monthKey(now, tz)
      const snap = await getDocs(
        query(tenantCol<LedgerLine>(tenantId, 'ledger'), where('period', '==', period)),
      )
      let total = 0
      for (const d of snap.docs) {
        const line = d.data()
        if (line.kind === 'payment' || line.kind === 'refund') total += line.amount
      }
      return { value: formatMoney(total, currency, locale) }
    },
  },
  {
    id: 'customersAttendedMtd',
    label: he.metrics.customersAttendedMtd,
    async compute({ tenantId, tz, now }) {
      const monthStart = zonedTimeToUtc(`${monthKey(now, tz)}-01`, '00:00', tz)
      // measure by attendedAt (when the class happened), not createdAt (when the
      // booking was made) — a June booking attended in July counts in July.
      const snap = await getDocs(
        query(
          tenantCol<Registration>(tenantId, 'registrations'),
          where('status', '==', 'attended'),
          where('attendedAt', '>=', Timestamp.fromDate(monthStart)),
        ),
      )
      const distinct = new Set(snap.docs.map((d) => d.data().customerId))
      return { value: String(distinct.size) }
    },
  },
  {
    id: 'sessionsThisWeek',
    label: he.metrics.sessionsThisWeek,
    async compute({ tenantId, tz, now }) {
      const start = weekStartKey(now, tz)
      const startAt = zonedTimeToUtc(start, '00:00', tz)
      const endAt = zonedTimeToUtc(addDaysKey(start, 7), '00:00', tz)
      const agg = await getCountFromServer(
        query(
          tenantCol(tenantId, 'sessions'),
          where('status', '==', 'scheduled'),
          where('startAt', '>=', Timestamp.fromDate(startAt)),
          where('startAt', '<', Timestamp.fromDate(endAt)),
        ),
      )
      return { value: String(agg.data().count) }
    },
  },
  {
    id: 'activeSubscriptions',
    label: he.metrics.activeSubscriptions,
    async compute({ tenantId }) {
      const agg = await getCountFromServer(
        query(tenantCol(tenantId, 'subscriptions'), where('status', '==', 'active')),
      )
      return { value: String(agg.data().count) }
    },
  },
]
