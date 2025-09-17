import React, { useState, useMemo } from 'react';
import TimelineTooltip from './TimelineTooltip';

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

interface ForecastData {
  cliente: string;
  job_site: string;
  month: string;
  year: number;
  projectCount: number;
  startDate: string;
  endDate: string;
}

interface TimelineGanttProps {
  forecastData: ForecastData[];
  workforceProjects: WorkforceProject[];
  selectedYear: string;
  selectedMonth: string;
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
}

export default function TimelineGantt({ 
  forecastData, 
  workforceProjects,
  selectedYear, 
  selectedMonth, 
  groupBy, 
  onGroupByChange 
}: TimelineGanttProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  
  // Estados para tooltip
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<any>(null);

  // Determinar se deve mostrar dias ou meses
  const showDays = selectedMonth && selectedMonth !== '';
  
  // Gerar colunas de tempo
  const timeColumns = useMemo(() => {
    if (showDays) {
      // Mostrar dias do mês selecionado
      const year = parseInt(selectedYear);
      const month = parseInt(selectedMonth);
      const daysInMonth = new Date(year, month, 0).getDate();
      
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const date = new Date(year, month - 1, day);
        return {
          label: day.toString(),
          fullLabel: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          date: date.toISOString().split('T')[0]
        };
      });
    } else {
      // Mostrar meses do ano selecionado
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      return months.map((month, index) => ({
        label: month.substring(0, 3),
        fullLabel: month,
        month: index + 1
      }));
    }
  }, [showDays, selectedYear, selectedMonth]);

  // Agrupar dados conforme seleção
  const groupedData = useMemo(() => {
    const groups: { [key: string]: ForecastData[] } = {};
    
    forecastData.forEach(item => {
      const groupKey = groupBy === 'cliente' ? item.cliente : item.job_site;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    return Object.entries(groups).map(([groupName, items]) => ({
      groupName,
      items,
      totalProjects: items.reduce((sum, item) => sum + item.projectCount, 0)
    })).sort((a, b) => b.totalProjects - a.totalProjects);
  }, [forecastData, groupBy]);

  // Calcular dados para cada célula do Gantt
  const getCellData = (groupName: string, timeColumn: any) => {
    const groupItems = groupedData.find(g => g.groupName === groupName)?.items || [];
    
    if (showDays) {
      // Para dias: verificar se há projetos que começam ou terminam neste dia
      const dayProjects = groupItems.filter(item => {
        const startDate = new Date(item.startDate);
        const endDate = new Date(item.endDate);
        const cellDate = new Date(timeColumn.date);
        
        return cellDate >= startDate && cellDate <= endDate;
      });
      
      return {
        count: dayProjects.reduce((sum, item) => sum + item.projectCount, 0),
        projects: dayProjects
      };
    } else {
      // Para meses: verificar se há projetos neste mês
      const monthProjects = groupItems.filter(item => {
        const startDate = new Date(item.startDate);
        const itemMonth = startDate.getMonth() + 1;
        return itemMonth === timeColumn.month;
      });
      
      return {
        count: monthProjects.reduce((sum, item) => sum + item.projectCount, 0),
        projects: monthProjects
      };
    }
  };

  // Função para obter cor dos blocos (sempre verde para dados individuais)
  const getBarColor = (count: number) => {
    if (count === 0) return 'transparent';
    return '#28a745'; // Verde
  };

  // Função para lidar com clique nos blocos
  const handleBlockClick = (event: React.MouseEvent, groupName: string, col: any) => {
    event.stopPropagation();
    
    const cellData = getCellData(groupName, col);
    if (cellData.count === 0) return;
    
    // Obter projetos para este grupo e período usando os dados completos
    const projects = workforceProjects.filter(project => {
      const groupKey = groupBy === 'cliente' ? project.cliente : project.job_site;
      if (groupKey !== groupName) return false;
      
      if (showDays) {
        return project.previous_start_date && project.previous_start_date.startsWith(col.date);
      } else {
        if (!project.previous_start_date) return false;
        const projectDate = new Date(project.previous_start_date);
        const projectMonth = projectDate.getMonth() + 1; // getMonth() retorna 0-11
        return projectMonth === col.month;
      }
    });
    
    setTooltipData({
      groupName,
      period: col.fullLabel,
      count: cellData.count,
      projects: projects.map(p => ({
        cliente: p.cliente,
        job_site: p.job_site,
        lote_building: p.lote_building,
        workforce: p.workforce,
        previous_start_date: p.previous_start_date,
        previous_end_date: p.previous_end_date,
        observacoes: p.observacoes
      }))
    });
    
    setTooltipPosition({ x: event.clientX, y: event.clientY });
    setTooltipVisible(true);
  };

  // Calcular contagem máxima para referência (não usado atualmente)
  // const maxCount = Math.max(...groupedData.map(group => 
  //   Math.max(...timeColumns.map(col => getCellData(group.groupName, col).count))
  // ));

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div className="card" style={{ background: 'var(--color-background-primary)', border: 'none' }}>
        <div className="card-header" style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderBottom: 'none', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0" style={{ color: 'var(--color-text-primary)', fontSize: 16 }}>
              <i className="bi bi-calendar3 me-2" style={{ color: 'var(--color-accent-primary)' }} />
              Timeline
            </h5>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Group by</span>
              <button 
                onClick={() => onGroupByChange('cliente')} 
                style={{ 
                  background: groupBy === 'cliente' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                  color: groupBy === 'cliente' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)', 
                  border: groupBy === 'cliente' ? '1.5px solid var(--color-accent-primary)' : '1.5px solid var(--color-border-divider)', 
                  borderRadius: 15, 
                  padding: '4px 16px', 
                  fontWeight: 500, 
                  fontSize: 14, 
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  if (groupBy !== 'cliente') {
                    e.currentTarget.style.background = 'var(--color-background-primary)';
                    e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                    e.currentTarget.style.color = 'var(--color-accent-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = groupBy === 'cliente' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                  e.currentTarget.style.borderColor = groupBy === 'cliente' ? 'var(--color-accent-primary)' : 'var(--color-border-divider)';
                  e.currentTarget.style.color = groupBy === 'cliente' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)';
                }}
              >
                Cliente
              </button>
              <button 
                onClick={() => onGroupByChange('job_site')} 
                style={{ 
                  background: groupBy === 'job_site' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
                  color: groupBy === 'job_site' ? '#fd7e14' : 'var(--color-text-primary)', 
                  border: groupBy === 'job_site' ? '1.5px solid #fd7e14' : '1.5px solid var(--color-border-divider)', 
                  borderRadius: 15, 
                  padding: '4px 16px', 
                  fontWeight: 500, 
                  fontSize: 14, 
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  if (groupBy !== 'job_site') {
                    e.currentTarget.style.background = 'var(--color-background-primary)';
                    e.currentTarget.style.borderColor = '#fd7e14';
                    e.currentTarget.style.color = '#fd7e14';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = groupBy === 'job_site' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
                  e.currentTarget.style.borderColor = groupBy === 'job_site' ? '#fd7e14' : 'var(--color-border-divider)';
                  e.currentTarget.style.color = groupBy === 'job_site' ? '#fd7e14' : 'var(--color-text-primary)';
                }}
              >
                Job Site
              </button>
            </div>
          </div>
        </div>
        <div className="card-body p-0" style={{ border: '1px solid var(--color-border-divider)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', overflow: 'hidden' }}>
          {forecastData.length === 0 ? (
            <div className="text-center p-4" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
              <p className="mb-0">Nenhuma obra encontrada para os filtros selecionados</p>
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
              <table className="table table-hover mb-0" style={{ border: 'none' }}>
                <thead style={{ background: 'var(--color-background-secondary)', position: 'sticky', top: 0, zIndex: 10, borderTop: 'none' }}>
                  <tr>
                    <th style={{ 
                      color: 'var(--color-text-primary)', 
                      fontSize: 14, 
                      fontWeight: 600, 
                      borderBottom: '1px solid var(--color-border-divider)', 
                      padding: '12px',
                      minWidth: 200,
                      position: 'sticky',
                      left: 0,
                      background: 'var(--color-background-secondary)',
                      zIndex: 11
                    }}>
                      {groupBy === 'cliente' ? 'Cliente' : 'Job Site'}
                    </th>
                    {timeColumns.map((col, index) => (
                      <th 
                        key={index}
                        style={{ 
                          color: 'var(--color-text-primary)', 
                          fontSize: 12, 
                          fontWeight: 600, 
                          borderBottom: '1px solid var(--color-border-divider)', 
                          padding: '12px 8px',
                          minWidth: 80,
                          textAlign: 'center',
                          background: 'var(--color-background-secondary)',
                          position: 'relative'
                        }}
                        title={col.fullLabel}
                      >
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center',
                          gap: 2
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                            {col.label}
                          </span>
                          {showDays && (
                            <span style={{ 
                              fontSize: 9, 
                              color: 'var(--color-text-secondary)',
                              fontWeight: 400
                            }}>
                              {col.fullLabel.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedData.map((group) => (
                    <tr key={group.groupName} style={{ borderBottom: '1px solid var(--color-border-divider)' }}>
                      <td style={{ 
                        color: 'var(--color-text-primary)', 
                        fontSize: 14, 
                        padding: '12px',
                        fontWeight: 500,
                        position: 'sticky',
                        left: 0,
                        background: 'var(--color-background-primary)',
                        zIndex: 1,
                        borderRight: '1px solid var(--color-border-divider)'
                      }}>
                        <div className="d-flex justify-content-between align-items-center">
                          <span>{group.groupName}</span>
                          <span 
                            className="badge" 
                            style={{ 
                              background: '#007bff', 
                              color: 'white', 
                              fontSize: 11, 
                              fontWeight: 600
                            }}
                          >
                            {group.totalProjects}
                          </span>
                        </div>
                      </td>
                      {timeColumns.map((col, colIndex) => {
                        const cellData = getCellData(group.groupName, col);
                        const isHovered = hoveredItem === `${group.groupName}-${colIndex}`;
                        
                        return (
                          <td 
                            key={colIndex}
                            style={{ 
                              padding: '6px',
                              textAlign: 'center',
                              position: 'relative',
                              background: 'var(--color-background-primary)',
                              minWidth: 80
                            }}
                            onMouseEnter={() => setHoveredItem(`${group.groupName}-${colIndex}`)}
                            onMouseLeave={() => setHoveredItem(null)}
                          >
                            {cellData.count > 0 && (
                              <div
                                style={{
                                  background: getBarColor(cellData.count),
                                  borderRadius: 6,
                                  padding: '6px 10px',
                                  color: 'white',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  minHeight: 28,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                  transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                                  boxShadow: isHovered 
                                    ? '0 4px 12px rgba(0,0,0,0.25)' 
                                    : '0 2px 4px rgba(0,0,0,0.1)',
                                  border: isHovered ? '2px solid rgba(255,255,255,0.3)' : '2px solid transparent',
                                  letterSpacing: 0.5
                                }}
                                title={`${cellData.count} obra${cellData.count !== 1 ? 's' : ''} - ${col.fullLabel}`}
                                onClick={(e) => handleBlockClick(e, group.groupName, col)}
                              >
                                {cellData.count}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: 'var(--color-background-secondary)' }}>
                  <tr style={{ borderBottom: 'none' }}>
                    <td style={{ 
                      color: 'var(--color-text-primary)', 
                      fontSize: 14, 
                      padding: '12px',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      background: 'var(--color-background-secondary)',
                      zIndex: 1,
                      borderRight: '1px solid var(--color-border-divider)',
                      borderBottom: 'none'
                    }}>
                      <div className="d-flex justify-content-between align-items-center">
                        <span>Total</span>
                        <span 
                          className="badge" 
                          style={{ 
                            background: '#007bff', 
                            color: 'white', 
                            fontSize: 11, 
                            fontWeight: 600
                          }}
                        >
                          {forecastData.reduce((sum, item) => sum + item.projectCount, 0)}
                        </span>
                      </div>
                    </td>
                    {timeColumns.map((col, colIndex) => {
                      const totalForColumn = groupedData.reduce((sum, group) => {
                        return sum + getCellData(group.groupName, col).count;
                      }, 0);
                      
                      return (
                        <td 
                          key={colIndex}
                          style={{ 
                            padding: '6px',
                            textAlign: 'center',
                            background: 'var(--color-background-secondary)',
                            minWidth: 80,
                            borderBottom: 'none'
                          }}
                        >
                          {totalForColumn > 0 && (
                            <div
                              style={{
                                background: '#007bff',
                                borderRadius: 6,
                                padding: '6px 10px',
                                color: 'white',
                                fontSize: 12,
                                fontWeight: 700,
                                minHeight: 28,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                letterSpacing: 0.5
                              }}
                            >
                              {totalForColumn}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {/* Tooltip */}
      <TimelineTooltip
        isVisible={tooltipVisible}
        position={tooltipPosition}
        data={tooltipData}
        onClose={() => setTooltipVisible(false)}
      />
    </div>
  );
}