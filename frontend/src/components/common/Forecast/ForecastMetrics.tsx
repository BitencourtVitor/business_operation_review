import MetricTooltip from '../../tooltips/MetricTooltip';

interface ForecastStats {
  totalProjects: number;
  uniqueClients: number;
  uniqueJobSites: number;
  periodStart: string;
  periodEnd: string;
}

interface ForecastMetricsProps {
  stats: ForecastStats;
}

export default function ForecastMetrics({ stats }: ForecastMetricsProps) {
  return (
    <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Summary</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        <MetricTooltip title="Total Works" content="Total number of works in the forecast.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Total</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{stats.totalProjects}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Unique Clients" content="Number of distinct clients in the forecast.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Clients</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{stats.uniqueClients}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Unique Job Sites" content="Number of distinct job sites in the forecast.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Job Sites</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{stats.uniqueJobSites}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Forecast Period" content="Start and end dates of scheduled works.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 180, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Period</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 14, letterSpacing: 0.5, textAlign: 'center' }}>
              {stats.periodStart && stats.periodEnd ? `${stats.periodStart} - ${stats.periodEnd}` : 'N/A'}
            </span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
}