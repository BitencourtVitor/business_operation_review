import React, { useState } from 'react';
import MonthlySummary from './MonthlySummary';

interface WorkforceProject {
  id: number;
  cliente: string;
  job_site: string;
  lote_building: number;
  workforce: string;
  previous_start_date: string;
  previous_end_date: string;
  observacoes: string;
  created_at: string;
  updated_at: string;
}

interface ForecastStats {
  totalProjects: number;
  uniqueClients: number;
  uniqueJobSites: number;
  periodStart: string;
  periodEnd: string;
}

interface MobileForecastMetricsProps {
  stats: ForecastStats;
  workforceProjects: WorkforceProject[];
  selectedYear: string;
  selectedMonth: string;
  selectedClient: string[];
  selectedJobSite: string[];
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
}

export default function MobileForecastMetrics({ 
  stats, 
  workforceProjects, 
  selectedYear, 
  selectedMonth, 
  selectedClient, 
  selectedJobSite,
  groupBy,
  onGroupByChange
}: MobileForecastMetricsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const metricStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    minHeight: '80px',
    justifyContent: 'center'
  };

  const metricValueStyle: React.CSSProperties = {
    color: 'var(--color-accent-primary)',
    fontWeight: 600,
    fontSize: '20px',
    marginBottom: '4px'
  };

  const metricLabelStyle: React.CSSProperties = {
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };

  const summaryButtonStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '12px 16px',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.3s',
    marginBottom: '10px',
    boxSizing: 'border-box'
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Botão de resumo */}
      <button
        style={summaryButtonStyle}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-background-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--color-background-secondary)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-bar-chart" style={{ color: 'var(--color-accent-primary)' }} />
          <span>Summary</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            color: 'var(--color-accent-primary)', 
            fontWeight: 600, 
            fontSize: '18px' 
          }}>
            {stats.totalProjects} projects
          </span>
          <i 
            className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} 
            style={{ color: 'var(--color-text-secondary)' }}
          />
        </div>
      </button>

      {/* Métricas expandidas */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          marginBottom: '10px'
        }}>
          {/* Métricas principais - 3 células lado a lado */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px'
          }}>
            {/* Total de Projetos */}
            <div style={metricStyle}>
              <div style={metricValueStyle}>
                {stats.totalProjects}
              </div>
              <div style={metricLabelStyle}>
                <i className="bi bi-hammer me-1" />
                Projects
              </div>
            </div>

            {/* Clientes Únicos */}
            <div style={metricStyle}>
              <div style={metricValueStyle}>
                {stats.uniqueClients}
              </div>
              <div style={metricLabelStyle}>
                <i className="bi bi-building me-1" />
                Clients
              </div>
            </div>

            {/* Job Sites Únicos */}
            <div style={metricStyle}>
              <div style={metricValueStyle}>
                {stats.uniqueJobSites}
              </div>
              <div style={metricLabelStyle}>
                <i className="bi bi-geo-alt me-1" />
                Locations
              </div>
            </div>
          </div>

          {/* Resumo Mensal */}
          <div style={{
            gridColumn: '1 / -1'
          }}>
            <MonthlySummary
              workforceProjects={workforceProjects}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedClient={selectedClient}
              selectedJobSite={selectedJobSite}
              groupBy={groupBy}
              onGroupByChange={onGroupByChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
