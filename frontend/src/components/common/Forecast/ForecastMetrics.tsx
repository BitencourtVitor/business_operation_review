import React from 'react';
import MonthlySummary from './MonthlySummary';
import type { WorkforceProject } from './types';

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
}

export default function ForecastMetrics({ 
  stats,
  workforceProjects,
  groupBy,
  onGroupByChange
}: ForecastMetricsProps) {
  const metricCardStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 16,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    flex: 1,
    minWidth: '200px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
    position: 'relative',
    overflow: 'hidden'
  };

  const metricValueStyle: React.CSSProperties = {
    color: 'var(--color-text-primary)',
    fontWeight: 800,
    fontSize: '28px',
    marginBottom: '2px',
    lineHeight: 1.1,
    zIndex: 1
  };

  const metricLabelStyle: React.CSSProperties = {
    color: 'var(--color-text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    zIndex: 1
  };

  const metricIconStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    marginBottom: '12px'
  };

  return (
    <div style={{ 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Cards de Métricas */}
      <div style={{ 
        display: 'flex', 
        gap: '20px', 
        width: '100%',
        flexWrap: 'wrap'
      }}>
        <div style={metricCardStyle}>
          <div style={{ ...metricIconStyle, background: 'rgba(var(--color-accent-primary-rgb), 0.1)', color: 'var(--color-accent-primary)' }}>
            <i className="bi bi-briefcase-fill" />
          </div>
          <div style={metricValueStyle}>{stats.totalProjects}</div>
          <div style={metricLabelStyle}>Total Projects</div>
        </div>

        <div style={metricCardStyle}>
          <div style={{ ...metricIconStyle, background: 'rgba(40, 167, 69, 0.1)', color: '#28a745' }}>
            <i className="bi bi-people-fill" />
          </div>
          <div style={metricValueStyle}>{stats.uniqueClients}</div>
          <div style={metricLabelStyle}>Unique Clients</div>
        </div>

        <div style={metricCardStyle}>
          <div style={{ ...metricIconStyle, background: 'rgba(253, 126, 20, 0.1)', color: '#fd7e14' }}>
            <i className="bi bi-geo-alt-fill" />
          </div>
          <div style={metricValueStyle}>{stats.uniqueJobSites}</div>
          <div style={metricLabelStyle}>Unique Job Sites</div>
        </div>

        <div style={metricCardStyle}>
          <div style={{ ...metricIconStyle, background: 'rgba(23, 162, 184, 0.1)', color: '#17a2b8' }}>
            <i className="bi bi-calendar-range-fill" />
          </div>
          <div style={{ ...metricValueStyle, fontSize: '14px', fontWeight: 700 }}>
            {new Date(stats.periodStart).toLocaleDateString()} - {new Date(stats.periodEnd).toLocaleDateString()}
          </div>
          <div style={metricLabelStyle}>Analysis Period</div>
        </div>
      </div>

      {/* Seção de Resumo Mensal */}
      <div style={{
        background: 'var(--color-background-secondary)',
        borderRadius: '24px',
        border: '1px solid var(--color-border-divider)',
        padding: '0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h3 style={{ 
            fontSize: '18px', 
            fontWeight: 800, 
            color: 'var(--color-text-primary)', 
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <i className="bi bi-calendar-week" style={{ color: 'var(--color-accent-primary)' }} />
            Monthly Summary & Distribution
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Group by</span>
            <div style={{ 
              display: 'flex', 
              background: 'var(--color-background-primary)', 
              borderRadius: '12px', 
              padding: '4px', 
              border: '1px solid var(--color-border-divider)'
            }}>
              <button 
                onClick={() => onGroupByChange('cliente')} 
                style={{ 
                  background: groupBy === 'cliente' ? 'var(--color-accent-primary)' : 'transparent', 
                  color: groupBy === 'cliente' ? 'white' : 'var(--color-text-secondary)', 
                  border: 'none', 
                  borderRadius: '8px', 
                  padding: '6px 16px', 
                  fontWeight: 600, 
                  fontSize: 12, 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Client
              </button>
              <button 
                onClick={() => onGroupByChange('job_site')} 
                style={{ 
                  background: groupBy === 'job_site' ? 'var(--color-accent-primary)' : 'transparent', 
                  color: groupBy === 'job_site' ? 'white' : 'var(--color-text-secondary)', 
                  border: 'none', 
                  borderRadius: '8px', 
                  padding: '6px 16px', 
                  fontWeight: 600, 
                  fontSize: 12, 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Job Site
              </button>
            </div>
          </div>
        </div>

        <MonthlySummary 
          workforceProjects={workforceProjects}
          groupBy={groupBy}
        />
      </div>
    </div>
  );
}