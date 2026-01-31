import React, { useState } from 'react';
import MetricTooltip from '../../tooltips/MetricTooltip';
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
  selectedYear: string;
  selectedMonth: string;
  selectedClient: string[];
  selectedJobSite: string[];
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
}

export default function ForecastMetrics({ 
  stats,
  workforceProjects,
  selectedYear,
  selectedMonth,
  selectedClient,
  selectedJobSite,
  groupBy,
  onGroupByChange
}: ForecastMetricsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const summaryButtonStyle: React.CSSProperties = {
    background: isExpanded ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
    border: `1px solid ${isExpanded ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
    borderRadius: 16,
    padding: '16px 24px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    marginBottom: isExpanded ? '24px' : '0',
    boxShadow: isExpanded ? '0 8px 20px -4px rgba(0,0,0,0.1)' : '0 2px 4px rgba(0,0,0,0.05)',
  };

  return (
    <div style={{ 
      width: '100%',
      marginBottom: '24px'
    }}>
      {/* Botão de Toggle do Resumo */}
      <button
        style={summaryButtonStyle}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'var(--color-accent-primary)',
            color: 'white',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(var(--color-accent-primary-rgb), 0.3)'
          }}>
            <i className={`bi bi-${isExpanded ? 'eye-slash-fill' : 'bar-chart-line-fill'}`} style={{ fontSize: '20px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '18px', lineHeight: 1.2 }}>Estatísticas & Resumo</span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', opacity: 0.8 }}>
              {isExpanded ? 'Clique para recolher o painel' : 'Clique para ver detalhes do período'}
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {!isExpanded && (
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Projetos</span>
                <span style={{ color: 'var(--color-accent-primary)', fontWeight: 800, fontSize: '20px', marginTop: '-2px' }}>{stats.totalProjects}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Clientes</span>
                <span style={{ color: 'var(--color-accent-primary)', fontWeight: 800, fontSize: '20px', marginTop: '-2px' }}>{stats.uniqueClients}</span>
              </div>
            </div>
          )}
          <div style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '50%', 
            background: isExpanded ? 'rgba(var(--color-accent-primary-rgb), 0.1)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}>
             <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} style={{ color: isExpanded ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', fontSize: '18px' }} />
          </div>
        </div>
      </button>

      {/* Conteúdo Expandido */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          animation: 'fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Grid de Métricas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px'
          }}>
            <MetricTooltip title="Total Projects" content="Total de projetos agendados no período selecionado.">
              <div style={metricCardStyle} onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}>
                <div style={{ ...metricValueStyle, color: 'var(--color-accent-primary)' }}>{stats.totalProjects}</div>
                <div style={metricLabelStyle}>Total de Projetos</div>
                <i className="bi bi-hammer" style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.03, transform: 'rotate(-15deg)' }} />
              </div>
            </MetricTooltip>

            <MetricTooltip title="Unique Clients" content="Número de clientes distintos atendidos.">
              <div style={metricCardStyle} onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}>
                <div style={metricValueStyle}>{stats.uniqueClients}</div>
                <div style={metricLabelStyle}>Clientes Ativos</div>
                <i className="bi bi-building" style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.03, transform: 'rotate(-15deg)' }} />
              </div>
            </MetricTooltip>

            <MetricTooltip title="Unique Job Sites" content="Número de locais de obra diferentes.">
              <div style={metricCardStyle} onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}>
                <div style={metricValueStyle}>{stats.uniqueJobSites}</div>
                <div style={metricLabelStyle}>Canteiros de Obra</div>
                <i className="bi bi-geo-alt" style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.03, transform: 'rotate(-15deg)' }} />
              </div>
            </MetricTooltip>

            <MetricTooltip title="Forecast Period" content="Intervalo de datas do cronograma atual.">
              <div style={{ ...metricCardStyle, gridColumn: 'span 1' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent-primary)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border-divider)'}>
                <div style={{ ...metricValueStyle, fontSize: '16px', fontWeight: 700, marginTop: '8px' }}>
                  {stats.periodStart && stats.periodEnd ? `${stats.periodStart} - ${stats.periodEnd}` : 'N/A'}
                </div>
                <div style={{ ...metricLabelStyle, marginTop: '4px' }}>Período do Forecast</div>
                <i className="bi bi-calendar-range" style={{ position: 'absolute', right: '-10px', bottom: '-10px', fontSize: '60px', opacity: 0.03, transform: 'rotate(-15deg)' }} />
              </div>
            </MetricTooltip>
          </div>

          {/* Seção de Resumo Mensal */}
          <div style={{
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)'
          }}>
            <div style={{ 
              marginBottom: '20px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              borderBottom: '1px solid var(--color-border-divider)',
              paddingBottom: '16px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(var(--color-accent-primary-rgb), 0.1)',
                color: 'var(--color-accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <i className="bi bi-calendar-check" style={{ fontSize: '18px' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Resumo por Mês</h3>
            </div>
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

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
