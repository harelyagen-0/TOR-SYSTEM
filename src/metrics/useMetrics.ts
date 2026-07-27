import { useQueries } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useTenant } from '../tenant/TenantProvider'
import { metricRegistry, type MetricDef, type MetricResult } from './registry'

export interface MetricCardData {
  def: MetricDef
  result: MetricResult | undefined
  isLoading: boolean
}

export function useMetrics(ids?: string[]): MetricCardData[] {
  const { tenantId } = useAuth()
  const tenant = useTenant()
  const defs = ids
    ? metricRegistry.filter((m) => ids.includes(m.id))
    : metricRegistry

  const results = useQueries({
    queries: defs.map((def) => ({
      queryKey: ['metric', tenantId, def.id],
      queryFn: () =>
        def.compute({
          tenantId: tenantId!,
          tz: tenant.timezone,
          currency: tenant.currency,
          locale: tenant.locale,
          now: new Date(),
        }),
      staleTime: 60_000,
    })),
  })

  return defs.map((def, i) => ({
    def,
    result: results[i].data,
    isLoading: results[i].isLoading,
  }))
}
