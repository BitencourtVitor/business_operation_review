
import type { ProjectMonitoringHvacData } from '../../../hooks/useProjectMonitoringHvacData';

interface ProjectMonitoringMetricsProps {
  allData: ProjectMonitoringHvacData[];
}

export default function ProjectMonitoringMetrics({ allData }: ProjectMonitoringMetricsProps) {
  // Calcular métricas
  const totalProjects = allData.length;

  return (
    <div className="d-flex flex-row align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border-divider)', borderTop: '1px solid var(--color-border-divider)' }}>
      <h4 className='d-flex justify-content-start ps-4 mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>Project Metrics</h4>
      <div className='d-flex flex-row align-items-center justify-content-center'>
        {/* Total de Projetos */}
        <div style={{ background: 'var(--color-background-primary)', padding: '8px 18px', minWidth: 140, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-divider)' }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 400, marginBottom: 2, textAlign: 'center' }}>Total Projects</span>
          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600, fontSize: 18, letterSpacing: 0.5, textAlign: 'center' }}>{totalProjects}</span>
        </div>
      </div>
    </div>
  );
}
