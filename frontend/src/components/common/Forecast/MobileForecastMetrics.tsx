import React, { useState } from 'react';
import MonthlySummary from './MonthlySummary';

interface ForecastFieldwire {
  id: number;
  obra_id: string;
  category: string | null;
  document: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

interface ForecastMachine {
  id: number;
  obra_id: string;
  category: string | null;
  subcategory: string | null;
  equipment_category: string | null;
  title: string | null;
  status: boolean | null;
  unit: string | null;
  lastupdate_datetimez: string | null;
}

interface ForecastContractStep {
  id: number;
  obra_id: string;
  step: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

interface WorkforceProject {
  id: string;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_bld: string | null;
  workforce: string | null;
  hvac: boolean | null;
  buildertrend: boolean | null;
  machine_provider: string | null;
  status: string | null;
  address: string | null;
  previous_beams_date: string | null;
  previous_start_date: string | null;
  previous_end_date: string | null;
  obs: string | null;
  create_datetime: string | null;
  lastupdate_datetimez: string | null;
  fieldwire?: ForecastFieldwire[];
  machines?: ForecastMachine[];
  contract_steps?: ForecastContractStep[];
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
  groupBy: 'cliente' | 'job_site';
}

export default function MobileForecastMetrics({ 
  stats, 
  workforceProjects, 
  groupBy
}: MobileForecastMetricsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const metricStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '6px 2px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    minHeight: '60px',
    justifyContent: 'center'
  };

  const metricValueStyle: React.CSSProperties = {
    color: 'var(--color-accent-primary)',
    fontWeight: 600,
    fontSize: '16px',
    marginBottom: '1px'
  };

  const metricLabelStyle: React.CSSProperties = {
    color: 'var(--color-text-secondary)',
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.3px'
  };

  const summaryButtonStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '6px 10px',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.3s',
    boxSizing: 'border-box'
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {/* Botão de resumo */}
      <button
        style={{
          ...summaryButtonStyle,
          height: '42px',
          padding: '0 10px'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-background-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--color-background-secondary)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="bi bi-bar-chart" style={{ color: 'var(--color-accent-primary)', fontSize: '14px' }} />
          <span>Summary</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ 
            color: 'var(--color-accent-primary)', 
            fontWeight: 600, 
            fontSize: '15px' 
          }}>
            {stats.totalProjects} projects
          </span>
          <i 
            className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} 
            style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}
          />
        </div>
      </button>

      {/* Métricas expandidas */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {/* Métricas principais - 3 células lado a lado */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '6px'
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
              groupBy={groupBy}
            />
          </div>
        </div>
      )}
    </div>
  );
}
