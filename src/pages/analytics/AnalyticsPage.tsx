import { SectionTitle, StatCard } from '../../components/ui'
import { he } from '../../locale/he'
import { useMetrics } from '../../metrics/useMetrics'

/**
 * [OPEN — spec §11]: the real metric list is not decided. This shell renders
 * whatever the registry contains; new metrics are registry entries only.
 */
export function AnalyticsPage() {
  const metrics = useMetrics()

  return (
    <section>
      <SectionTitle aside={he.analytics.subtitle}>{he.analytics.title}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ def, result, isLoading }) => (
          <StatCard
            key={def.id}
            label={def.label}
            value={isLoading ? '…' : result?.value ?? '—'}
            sub={result?.sub}
          />
        ))}
      </div>
    </section>
  )
}
