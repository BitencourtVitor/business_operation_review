import { useMemo } from 'react';
import type { WorkforceProject } from './types';

interface MonthlySummaryProps {
  workforceProjects: WorkforceProject[];
  groupBy: 'cliente' | 'job_site';
}

interface MonthlyData {
  month: string;
  year: number;
  total: number;
  companies: { [company: string]: number };
}

export default function MonthlySummary({ 
  workforceProjects, 
  groupBy
}: MonthlySummaryProps) {
  
  // Processar dados mensais
  const monthlyData = useMemo(() => {
    if (!workforceProjects.length) return [];

    // Agrupar por mês
    const grouped: { [key: string]: MonthlyData } = {};

    workforceProjects.forEach(project => {
      if (!project.previous_start_date) return;
      
      const startDate = new Date(project.previous_start_date);
      if (isNaN(startDate.getTime())) return;
      
      const monthKey = `${startDate.getFullYear()}-${startDate.getMonth()}`;
      const monthName = startDate.toLocaleString('en-US', { month: 'long' }) + ' / ' + startDate.getFullYear();
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = {
          month: monthName,
          year: startDate.getFullYear(),
          total: 0,
          companies: {}
        };
      }

      // Agrupar por empresa (cliente ou job_site)
      const company = groupBy === 'cliente' ? project.cliente : project.job_site;
      if (!grouped[monthKey].companies[company]) {
        grouped[monthKey].companies[company] = 0;
      }
      grouped[monthKey].companies[company]++;
      grouped[monthKey].total++;
    });

    // Converter para array e ordenar por data
    return Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return new Date(a.month.split(' / ')[1] + ' ' + a.month.split(' / ')[0]).getMonth() - 
             new Date(b.month.split(' / ')[1] + ' ' + b.month.split(' / ')[0]).getMonth();
    });
  }, [workforceProjects, groupBy]);

  if (monthlyData.length === 0) {
    return (
      <div style={{
        background: 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-divider)',
        borderRadius: 8,
        padding: '16px',
        textAlign: 'center'
      }}>
        <p style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--color-text-secondary)'
        }}>
          No data available for the selected period
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Scroll horizontal */}
      <div style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBottom: '6px',
        WebkitOverflowScrolling: 'touch'
      }}>
        <div style={{
          display: 'flex',
          gap: '10px',
          minWidth: 'max-content',
          paddingBottom: '2px'
        }}>
          {monthlyData.map((monthData) => (
            <div
              key={`${monthData.year}-${monthData.month}`}
              style={{
                background: 'var(--color-background-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 8,
                padding: '10px',
                minWidth: '120px',
                flexShrink: 0
              }}
            >
              {/* Mês e total */}
              <div style={{
                textAlign: 'center',
                marginBottom: '8px'
              }}>
                <h5 style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  textTransform: 'capitalize'
                }}>
                  {monthData.month}
                </h5>
                <div style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--color-accent-primary)'
                }}>
                  {monthData.total} project{monthData.total !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Distribuição por empresa */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {Object.entries(monthData.companies).map(([company, count]) => (
                  <div
                    key={company}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px'
                    }}
                  >
                    <span style={{
                      color: 'var(--color-text-secondary)',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '80px'
                    }}>
                      {company}
                    </span>
                    <span style={{
                      color: 'var(--color-text-primary)',
                      fontWeight: 600,
                      background: 'var(--color-background-secondary)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicador de scroll */}
      {monthlyData.length > 3 && (
        <div style={{
          textAlign: 'center',
          marginTop: '8px'
        }}>
          <i className="bi bi-arrow-left-right" style={{
            color: 'var(--color-text-secondary)',
            fontSize: '12px'
          }} />
          <span style={{
            color: 'var(--color-text-secondary)',
            fontSize: '12px',
            marginLeft: '4px'
          }}>
            Swipe to see more months
          </span>
        </div>
      )}
    </div>
  );
}
