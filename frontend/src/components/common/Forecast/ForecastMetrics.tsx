import React from 'react';
import MonthlySummary from './MonthlySummary';
import type { WorkforceProject, DateMode } from './types';

interface ForecastStats {
  totalProjects: number;
  uniqueClients: number;
  uniqueJobSites: number;
  periodStart: string;
  periodEnd: string;
}

interface ForecastMetricsProps {
  stats: ForecastStats;
  workforceProjects: WorkforceProject[];
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
  dateMode: DateMode;
}

export default function ForecastMetrics({ 
  stats,
  workforceProjects,
  groupBy,
  onGroupByChange,
  dateMode
}: ForecastMetricsProps) {
  const metricCardStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--color-border-divider)',
    borderRadius: '12px',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    flex: 1,
    minWidth: '150px'
  };

  const metricValueStyle: React.CSSProperties = {
    color: 'var(--color-accent-primary)',
    fontWeight: 700,
    fontSize: '20px',
    marginBottom: '2px'
  };

  const metricLabelStyle: React.CSSProperties = {
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  };

  return (
    <div style={{ 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* Cards de Métricas Simplificados */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        width: '100%',
        flexWrap: 'wrap'
      }}>
        <div style={metricCardStyle}>
          <div style={metricValueStyle}>{stats.totalProjects}</div>
          <div style={metricLabelStyle}>
            <i className="bi bi-tools" style={{ fontSize: '12px' }} />
            PROJECTS
          </div>
        </div>

        <div style={metricCardStyle}>
          <div style={metricValueStyle}>{stats.uniqueClients}</div>
          <div style={metricLabelStyle}>
            <i className="bi bi-building" style={{ fontSize: '12px' }} />
            CLIENTS
          </div>
        </div>

        <div style={metricCardStyle}>
          <div style={metricValueStyle}>{stats.uniqueJobSites}</div>
          <div style={metricLabelStyle}>
            <i className="bi bi-geo-alt" style={{ fontSize: '12px' }} />
            LOCATIONS
          </div>
        </div>
      </div>

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