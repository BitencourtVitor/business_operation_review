import React, { useMemo, useState } from 'react';
import type { WorkforceProject, DateMode } from './types';
import { 
  isFieldwireComplete, 
  isMachinesComplete, 
  hasCompleteContract, 
  hasStorage, 
  getReferenceDate 
} from './helpers';

interface ForecastMetricsTabProps {
  workforceProjects: WorkforceProject[];
  dateMode: DateMode;
}

interface MonthlyMetric {
  monthKey: string;
  monthName: string;
  year: number;
  totalProjects: number;
  fieldwireDone: number;
  buildertrendDone: number;
  machinesDone: number;
  contractDone: number;
  storageDone: number;
  qbtimeDone: number;
}

export default function ForecastMetricsTab({ workforceProjects, dateMode }: ForecastMetricsTabProps) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const metricsByMonth = useMemo(() => {
    const grouped: { [key: string]: MonthlyMetric } = {};

    workforceProjects.forEach(project => {
      const referenceDate = getReferenceDate(project, dateMode);
      if (!referenceDate) return;

      const date = new Date(referenceDate);
      if (isNaN(date.getTime())) return;

      const year = date.getUTCFullYear();
      const monthIndex = date.getUTCMonth();
      const monthKey = `${year}-${monthIndex.toString().padStart(2, '0')}`;
      const monthName = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

      if (!grouped[monthKey]) {
        grouped[monthKey] = {
          monthKey,
          monthName,
          year,
          totalProjects: 0,
          fieldwireDone: 0,
          buildertrendDone: 0,
          machinesDone: 0,
          contractDone: 0,
          storageDone: 0,
          qbtimeDone: 0,
        };
      }

      const m = grouped[monthKey];
      m.totalProjects++;
      if (isFieldwireComplete(project)) m.fieldwireDone++;
      if (project.buildertrend) m.buildertrendDone++;
      if (isMachinesComplete(project)) m.machinesDone++;
      if (hasCompleteContract(project)) m.contractDone++;
      if (hasStorage(project)) m.storageDone++;
      if (project.qbtime) m.qbtimeDone++;
    });

    return Object.values(grouped).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [workforceProjects, dateMode]);

  const selectedMonthData = useMemo(() => {
    if (!selectedMonthKey) return null;
    
    const monthMetrics = metricsByMonth.find(m => m.monthKey === selectedMonthKey);
    if (!monthMetrics) return null;

    const projectsInMonth = workforceProjects.filter(project => {
      const referenceDate = getReferenceDate(project, dateMode);
      if (!referenceDate) return false;
      const date = new Date(referenceDate);
      const year = date.getUTCFullYear();
      const monthIndex = date.getUTCMonth();
      return `${year}-${monthIndex.toString().padStart(2, '0')}` === selectedMonthKey;
    });

    return {
      metrics: monthMetrics,
      projects: projectsInMonth
    };
  }, [selectedMonthKey, metricsByMonth, workforceProjects, dateMode]);

  const calculatePercentage = (done: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return '#4ade80'; // Green
    if (percentage >= 50) return '#fbbf24'; // Yellow
    return '#f87171'; // Red
  };

  if (workforceProjects.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-bar-chart" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }} />
        <p>No projects found with the current filters.</p>
      </div>
    );
  }

  // View de Detalhes de um Mês Específico
  if (selectedMonthData) {
    return (
      <div style={{ padding: '24px 24px 60px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => setSelectedMonthKey(null)}
            style={{
              background: 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            <i className="bi bi-arrow-left" />
            Back to Overview
          </button>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Detail: {selectedMonthData.metrics.monthName} {selectedMonthData.metrics.year}
          </h2>
        </div>

        <div style={{ 
          background: 'var(--color-background-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--color-border-divider)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'rgba(var(--color-text-primary-rgb), 0.03)', borderBottom: '1px solid var(--color-border-divider)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Project / Job Site</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Fieldwire</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>BT</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Machines</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Contract</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Storage</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>QBTime</th>
              </tr>
            </thead>
            <tbody>
              {selectedMonthData.projects.map((project) => (
                <tr key={project.id} style={{ borderBottom: '1px solid var(--color-border-divider)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 500, marginBottom: '2px' }}>{project.cliente}</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '14px' }}>
                      {project.job_site} 
                      <span style={{ 
                        marginLeft: '8px', 
                        fontSize: '11px', 
                        color: 'var(--color-accent-primary)',
                        background: 'rgba(var(--color-accent-primary-rgb), 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {project.type} {project.lote_bld}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <i className={`bi ${isFieldwireComplete(project) ? 'bi-check-circle-fill' : 'bi-x-circle'}`} style={{ color: isFieldwireComplete(project) ? '#4ade80' : '#f87171', fontSize: '16px' }} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <i className={`bi ${project.buildertrend ? 'bi-check-circle-fill' : 'bi-x-circle'}`} style={{ color: project.buildertrend ? '#4ade80' : '#f87171', fontSize: '16px' }} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <i className={`bi ${isMachinesComplete(project) ? 'bi-check-circle-fill' : 'bi-x-circle'}`} style={{ color: isMachinesComplete(project) ? '#4ade80' : '#f87171', fontSize: '16px' }} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <i className={`bi ${hasCompleteContract(project) ? 'bi-check-circle-fill' : 'bi-x-circle'}`} style={{ color: hasCompleteContract(project) ? '#4ade80' : '#f87171', fontSize: '16px' }} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <i className={`bi ${hasStorage(project) ? 'bi-check-circle-fill' : 'bi-x-circle'}`} style={{ color: hasStorage(project) ? '#4ade80' : '#f87171', fontSize: '16px' }} />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <i className={`bi ${project.qbtime ? 'bi-check-circle-fill' : 'bi-x-circle'}`} style={{ color: project.qbtime ? '#4ade80' : '#f87171', fontSize: '16px' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // View Geral (Mês a Mês)
  return (
    <div style={{ padding: '24px 24px 80px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {metricsByMonth.map((month) => (
          <div 
            key={month.monthKey}
            onClick={() => setSelectedMonthKey(month.monthKey)}
            style={{
              background: 'var(--color-background-secondary)',
              borderRadius: '16px',
              border: '1px solid var(--color-border-divider)',
              padding: '20px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {month.monthName} {month.year}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  background: 'var(--color-accent-primary)', 
                  color: '#fff', 
                  padding: '4px 10px', 
                  borderRadius: '20px', 
                  fontSize: '12px', 
                  fontWeight: 600 
                }}>
                  {month.totalProjects} Projects
                </span>
                <i className="bi bi-chevron-right" style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Fieldwire', done: month.fieldwireDone, icon: 'bi-grid-3x3-gap' },
                { label: 'Buildertrend', done: month.buildertrendDone, icon: 'bi-house-check' },
                { label: 'Machines', done: month.machinesDone, icon: 'bi-truck' },
                { label: 'Contract', done: month.contractDone, icon: 'bi-file-earmark-text' },
                { label: 'Storage', done: month.storageDone, icon: 'bi-box-seam' },
                { label: 'QBTime', done: month.qbtimeDone, icon: 'bi-clock-history' },
              ].map((aspect) => {
                const percentage = calculatePercentage(aspect.done, month.totalProjects);
                return (
                  <div key={aspect.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className={`bi ${aspect.icon}`} />
                        {aspect.label}
                      </span>
                      <span style={{ fontWeight: 600, color: getProgressColor(percentage) }}>
                        {aspect.done} • {percentage}%
                      </span>
                    </div>
                    <div style={{ 
                      height: '6px', 
                      background: 'rgba(var(--color-text-primary-rgb), 0.05)', 
                      borderRadius: '3px', 
                      overflow: 'hidden' 
                    }}>
                      <div style={{ 
                        width: `${percentage}%`, 
                        height: '100%', 
                        background: getProgressColor(percentage),
                        transition: 'width 0.5s ease-out'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
