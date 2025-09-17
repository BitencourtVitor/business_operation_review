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
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Resumo do Forecast</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        <MetricTooltip title="Total de Obras" content="Quantidade total de obras no forecast.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 90, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Total</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{stats.totalProjects}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Clientes Únicos" content="Número de clientes distintos no forecast.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Clientes</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{stats.uniqueClients}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Job Sites Únicos" content="Número de job sites distintos no forecast.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 120, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Job Sites</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{stats.uniqueJobSites}</span>
          </div>
        </MetricTooltip>
        <MetricTooltip title="Período do Forecast" content="Data de início e fim das obras programadas.">
          <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 180, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2 }}>Período</span>
            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 14, letterSpacing: 0.5, textAlign: 'center' }}>
              {stats.periodStart && stats.periodEnd ? `${stats.periodStart} - ${stats.periodEnd}` : 'N/A'}
            </span>
          </div>
        </MetricTooltip>
      </div>
    </div>
  );
}