import React, { useState, useMemo, useRef } from 'react';

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

interface TimelinePlannerProps {
  forecastData: ForecastData[];
  workforceProjects: WorkforceProject[];
  selectedYear: string;
  selectedMonth: string;
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
}

export default function TimelinePlanner({ 
  workforceProjects,
  selectedYear, 
  selectedMonth, 
  groupBy, 
  onGroupByChange 
}: TimelinePlannerProps) {
  const [draggedProject, setDraggedProject] = useState<WorkforceProject | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [timelineDragStart, setTimelineDragStart] = useState({ x: 0, scrollLeft: 0 });
  
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
          date: date.toISOString().split('T')[0],
          width: 120 // Largura fixa para dias
        };
      });
    } else {
      // Mostrar meses do ano selecionado
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      // Se não há filtros de tempo, mostrar apenas meses com dados
      if (!selectedYear || selectedYear === '') {
        // Encontrar meses que têm projetos
        const monthsWithData = new Set<number>();
        
        workforceProjects.forEach(project => {
          if (project.previous_start_date) {
            const projectDate = new Date(project.previous_start_date);
            monthsWithData.add(projectDate.getMonth() + 1);
          }
        });
        
        // Retornar apenas meses com dados
        return Array.from(monthsWithData)
          .sort((a, b) => a - b)
          .map(monthIndex => ({
            label: months[monthIndex - 1].substring(0, 3),
            fullLabel: months[monthIndex - 1],
            month: monthIndex,
            width: 200 // Largura maior para meses
          }));
      } else {
        // Se há filtro de ano, mostrar todos os meses do ano
        return months.map((month, index) => ({
          label: month.substring(0, 3),
          fullLabel: month,
          month: index + 1,
          width: 200 // Largura maior para meses
        }));
      }
    }
  }, [showDays, selectedYear, selectedMonth, workforceProjects]);

  // Agrupar dados conforme seleção
  const groupedData = useMemo(() => {
    const groups: { [key: string]: WorkforceProject[] } = {};
    
    workforceProjects.forEach(project => {
      const groupKey = groupBy === 'cliente' ? project.cliente : project.job_site;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(project);
    });

    return Object.entries(groups).map(([groupName, projects]) => ({
      groupName,
      projects: projects.sort((a, b) => {
        const dateA = new Date(a.previous_start_date || '1900-01-01');
        const dateB = new Date(b.previous_start_date || '1900-01-01');
        return dateA.getTime() - dateB.getTime();
      })
    })).sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [workforceProjects, groupBy]);

  // Calcular altura total de projetos para cada grupo
  const getGroupHeight = (groupName: string) => {
    let maxCardsInColumn = 0;
    
    // Encontrar o número máximo de cards em qualquer coluna para este grupo
    timeColumns.forEach(col => {
      const projects = getProjectsForPeriod(groupName, col);
      maxCardsInColumn = Math.max(maxCardsInColumn, projects.length);
    });
    
    if (maxCardsInColumn === 0) {
      return 100; // Altura mínima quando não há projetos
    }
    
    // Altura simples: cada card 100px + 8px de margin + 8px de padding top
    const cardHeight = 100;
    const cardMargin = 8;
    const topPadding = 8;
    const totalHeight = maxCardsInColumn * (cardHeight + cardMargin) + topPadding;
    
    return totalHeight;
  };

  // Obter projetos para um grupo e período específico
  const getProjectsForPeriod = (groupName: string, timeColumn: { month?: number; date?: string }) => {
    const groupProjects = groupedData.find(g => g.groupName === groupName)?.projects || [];
    
    return groupProjects.filter(project => {
      if (!project.previous_start_date) return false;
      
      if (showDays) {
        return timeColumn.date ? project.previous_start_date.startsWith(timeColumn.date) : false;
      } else {
        const projectDate = new Date(project.previous_start_date);
        const projectMonth = projectDate.getMonth() + 1;
        const projectYear = projectDate.getFullYear();
        
        // Se há filtro de ano, verificar se o projeto está no ano correto
        if (selectedYear && selectedYear !== '') {
          const selectedYearNum = parseInt(selectedYear);
          return projectMonth === timeColumn.month && projectYear === selectedYearNum;
        }
        
        // Se não há filtro de ano, apenas verificar o mês
        return projectMonth === timeColumn.month;
      }
    });
  };

  // Funções de drag and drop
  const handleDragStart = (e: React.DragEvent, project: WorkforceProject) => {
    setDraggedProject(project);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetGroupName: string, targetTimeColumn: { month?: number; date?: string }) => {
    e.preventDefault();
    
    if (!draggedProject) return;

    // Aqui você pode implementar a lógica para atualizar a data do projeto
    // Por exemplo, chamando uma função de callback para atualizar no backend
    console.log('Moving project:', draggedProject.id, 'to:', targetGroupName, targetTimeColumn);
    
    setDraggedProject(null);
  };

  const handleDragEnd = () => {
    setDraggedProject(null);
  };

  // Funções para drag and drop da timeline
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.timeline-content')) {
      setIsDraggingTimeline(true);
      setTimelineDragStart({
        x: e.clientX,
        scrollLeft: timelineRef.current?.scrollLeft || 0
      });
      e.preventDefault();
    }
  };

  const handleTimelineMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingTimeline || !timelineRef.current) return;
    
    const deltaX = e.clientX - timelineDragStart.x;
    const newScrollLeft = timelineDragStart.scrollLeft - deltaX;
    timelineRef.current.scrollLeft = newScrollLeft;
  };

  const handleTimelineMouseUp = () => {
    setIsDraggingTimeline(false);
  };

  const handleTimelineMouseLeave = () => {
    setIsDraggingTimeline(false);
  };


  return (
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <div className="card" style={{ background: 'var(--color-background-primary)', border: 'none', height: '100%' }}>
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
              >
                Job Site
              </button>
            </div>
          </div>
        </div>
        
        <div className="card-body p-0" style={{ border: '1px solid var(--color-border-divider)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', overflow: 'hidden', height: 'calc(100% - 60px)' }}>
          {groupedData.length === 0 ? (
            <div className="text-center p-4" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
              <p className="mb-0">Nenhuma obra encontrada para os filtros selecionados</p>
            </div>
          ) : (
            <>
            {/* Container principal com scroll horizontal */}
            <div 
              ref={timelineRef}
              className="custom-scrollbar"
              style={{ 
                height: '100%',
                overflow: 'auto',
                background: 'var(--color-background-primary)',
                cursor: isDraggingTimeline ? 'grabbing' : 'grab',
                position: 'relative'
              }}
              onMouseDown={handleTimelineMouseDown}
              onMouseMove={handleTimelineMouseMove}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseLeave}
            >
              {/* Container da tabela com largura total */}
              <div style={{ 
                width: 250 + timeColumns.reduce((sum, col) => sum + col.width, 0),
                minWidth: 250 + timeColumns.reduce((sum, col) => sum + col.width, 0)
              }}>
                {/* Header da tabela */}
                <div style={{ 
                  display: 'flex', 
                  background: 'var(--color-background-secondary)', 
                  borderBottom: '1px solid var(--color-border-divider)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  width: '100%'
                }}>
                  {/* Header da coluna de Jobsites - Posição fixa */}
                  <div style={{ 
                    width: 250,
                    minWidth: 250,
                    maxWidth: 250,
                    padding: '16px',
                    background: 'var(--color-background-secondary)',
                    borderRight: '1px solid var(--color-border-divider)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 12,
                    flexShrink: 0,
                    boxSizing: 'border-box'
                  }}>
                    <h6 style={{ 
                      margin: 0, 
                      color: 'var(--color-text-primary)', 
                      fontSize: 14, 
                      fontWeight: 600 
                    }}>
                      {groupBy === 'cliente' ? 'Clientes' : 'Job Sites'}
                    </h6>
                  </div>
                  
                  {/* Headers dos meses - Scroll horizontal */}
                  <div style={{ 
                    display: 'flex',
                    minWidth: timeColumns.reduce((sum, col) => sum + col.width, 0)
                  }}>
                    {timeColumns.map((col, index) => (
                      <div 
                        key={index}
                        style={{ 
                          width: col.width,
                          minWidth: col.width,
                          maxWidth: col.width,
                          padding: '16px 12px',
                          textAlign: 'center',
                          background: 'var(--color-background-secondary)',
                          borderRight: '1px solid var(--color-border-divider)',
                          flexShrink: 0,
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ 
                          fontSize: 12, 
                          fontWeight: 600, 
                          color: 'var(--color-text-primary)',
                          marginBottom: 2
                        }}>
                          {col.label}
                        </div>
                        {showDays && (
                          <div style={{ 
                            fontSize: 10, 
                            color: 'var(--color-text-secondary)' 
                          }}>
                            {col.fullLabel.split(' ')[0]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conteúdo da tabela */}
                <div 
                  className="timeline-content"
                  style={{ position: 'relative' }}
                  onDragOver={handleDragOver}
                >
                  {groupedData.map((group, groupIndex) => (
                    <div 
                      key={group.groupName}
                      style={{ 
                        display: 'flex',
                        height: getGroupHeight(group.groupName),
                        borderBottom: groupIndex < groupedData.length - 1 ? '1px solid var(--color-border-divider)' : 'none',
                        width: '100%'
                      }}
                    >
                      {/* Coluna de Jobsites - Posição fixa */}
                      <div 
                        style={{ 
                          width: 250,
                          minWidth: 250,
                          maxWidth: 250,
                          padding: '12px 16px', 
                          background: 'var(--color-background-primary)',
                          borderRight: '1px solid var(--color-border-divider)',
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ 
                          fontSize: 14, 
                          fontWeight: 500, 
                          color: 'var(--color-text-primary)'
                        }}>
                          {group.groupName}
                        </div>
                        <div style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          marginTop: 4
                        }}>
                          {group.projects.length} obra{group.projects.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      
                      {/* Colunas dos meses - Scroll horizontal */}
                      <div style={{ 
                        display: 'flex',
                        minWidth: timeColumns.reduce((sum, col) => sum + col.width, 0)
                      }}>
                        {timeColumns.map((col, colIndex) => {
                          const projects = getProjectsForPeriod(group.groupName, col);
                          
                          return (
                            <div 
                              key={colIndex}
                              style={{ 
                                width: col.width,
                                minWidth: col.width,
                                maxWidth: col.width,
                                padding: '8px 8px 0 8px',
                                background: 'var(--color-background-primary)',
                                position: 'relative',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'flex-start',
                                borderRight: '1px solid var(--color-border-divider)',
                                flexShrink: 0,
                                boxSizing: 'border-box'
                              }}
                              onDrop={(e) => handleDrop(e, group.groupName, col)}
                              onDragOver={handleDragOver}
                            >
                              {projects.map((project, projectIndex) => (
                                <div
                                  key={project.id}
                                  draggable
                                style={{
                                  background: 'var(--color-accent-primary)',
                                  borderRadius: 6,
                                  padding: '10px',
                                  marginBottom: projectIndex < projects.length - 1 ? 8 : 0,
                                  color: 'white',
                                  fontSize: 12,
                                  cursor: 'grab',
                                  transition: 'all 0.2s ease',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  userSelect: 'none',
                                  height: 100,
                                  flexShrink: 0,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  textAlign: 'center'
                                }}
                                  onDragStart={(e) => handleDragStart(e, project)}
                                  onDragEnd={handleDragEnd}
                                  onMouseEnter={(e) => {
                                    if (!draggedProject) {
                                      e.currentTarget.style.background = 'var(--color-accent-secondary)';
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                      e.currentTarget.style.cursor = 'grab';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!draggedProject) {
                                      e.currentTarget.style.background = 'var(--color-accent-primary)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }
                                  }}
                                >
                                <div style={{ 
                                  fontWeight: 600, 
                                  marginBottom: 4,
                                  fontSize: 12
                                }}>
                                  {project.cliente} • {project.job_site}
                                </div>
                                <div style={{ 
                                  fontSize: 12, 
                                  opacity: 0.9,
                                  marginBottom: 4
                                }}>
                                  Lot/Building {project.lote_building}
                                </div>
                                <div style={{ 
                                  fontSize: 11, 
                                  opacity: 0.8,
                                  marginBottom: 4,
                                  fontWeight: project.workforce ? 'normal' : 'bold',
                                  color: project.workforce ? 'inherit' : '#ffcc00'
                                }}>
                                  {project.workforce || 'No team assigned'}
                                </div>
                                {project.previous_start_date && project.previous_end_date && (
                                  <div style={{ 
                                    fontSize: 11, 
                                    opacity: 0.7
                                  }}>
                                    Start: {new Date(project.previous_start_date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })} | End: {new Date(project.previous_end_date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                  </div>
                                )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
