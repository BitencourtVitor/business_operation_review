import React from 'react';
import type { ProjectMonitoringHvacData } from '../../../hooks/useProjectMonitoringHvacData';

interface ProjectMonitoringMetricsProps {
  allData: ProjectMonitoringHvacData[];
}

export default function ProjectMonitoringMetrics({ allData }: ProjectMonitoringMetricsProps) {
  // Calcular métricas
  const totalProjects = allData.length;

  // Calcular média de tempo para resolver (apenas projetos com start_date e finish_date)
  const projectsWithDates = allData.filter(project => project.start_date && project.finish_date);
  const averageTimeToComplete = projectsWithDates.length > 0 
    ? Math.round(
        projectsWithDates.reduce((sum, project) => {
          const startDate = new Date(project.start_date!);
          const finishDate = new Date(project.finish_date!);
          const days = Math.ceil((finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / projectsWithDates.length
      )
    : 0;

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
