import MonthlySummary from './MonthlySummary';
import type { WorkforceProject, DateMode } from './types';

interface ForecastMetricsProps {
  workforceProjects: WorkforceProject[];
  groupBy: 'cliente' | 'job_site';
  dateMode: DateMode;
}

export default function ForecastMetrics({ 
  workforceProjects,
  groupBy,
  dateMode
}: ForecastMetricsProps) {
  return (
    <div style={{ 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* Seção de Resumo Mensal Direta */}
      <div style={{ width: '100%' }}>
        <MonthlySummary 
          workforceProjects={workforceProjects} 
          groupBy={groupBy}
          dateMode={dateMode}
        />
      </div>
    </div>
  );
}