import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateShort } from '../../../utils/formatters';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';

// Função para determinar status da obra baseado nas datas
const getProjectStatus = (project: WorkforceProject): 'not-started' | 'in-progress' | 'completed' | 'no-end-date' => {
  const today = new Date();
  const startDate = project.previous_start_date ? new Date(project.previous_start_date) : null;
  const endDate = project.previous_end_date ? new Date(project.previous_end_date) : null;

  // Se não tem data de início, considerar como não iniciada
  if (!startDate) {
    return 'not-started';
  }

  // Se não tem data final, considerar como sem data final
  if (!endDate) {
    return 'no-end-date';
  }

  // Se já passou da data final, está finalizada
  if (today > endDate) {
    return 'completed';
  }

  // Se está entre as datas de início e fim, está em andamento
  if (today >= startDate && today <= endDate) {
    return 'in-progress';
  }

  // Se ainda não chegou na data de início, não iniciada
  return 'not-started';
};

// Cores para cada status
const PROJECT_STATUS_COLORS = {
  'not-started': {
    primary: '#6c757d', // Cinza
    hover: '#5a6268'     // Cinza mais escuro
  },
  'in-progress': {
    primary: '#28a745',  // Verde
    hover: '#218838'     // Verde mais escuro
  },
  'completed': {
    primary: '#5a9fd4',  // Azul mais claro baseado no primary
    hover: '#4a8bc4'     // Azul mais escuro para hover
  },
  'no-end-date': {
    primary: '#ffc107',  // Amarelo
    hover: '#e0a800'     // Amarelo mais escuro
  }
};

interface WorkforceProject {
  id: number;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_building: number;
  workforce: string;
  hvac: string | null;
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
  sortByDate: 'off' | 'asc' | 'desc' | null;
  onSortByDateChange: (sortByDate: 'off' | 'asc' | 'desc' | null) => void;
}

export default function TimelinePlanner({ 
  workforceProjects,
  selectedYear, 
  selectedMonth, 
  groupBy, 
  onGroupByChange,
  sortByDate,
  onSortByDateChange
}: TimelinePlannerProps) {
  const navigate = useNavigate();
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
    
    // Considerar apenas projetos com datas válidas de início e fim
    const validProjects = workforceProjects.filter(p => {
      if (!p.previous_start_date || !p.previous_end_date) return false;
      const s = new Date(p.previous_start_date);
      const e = new Date(p.previous_end_date);
      return !isNaN(s.getTime()) && !isNaN(e.getTime());
    });

    validProjects.forEach(project => {
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
  const getCardHeight = (project: WorkforceProject) => {
    const baseHeight = 140;
    const hasObservation = !!(project.observacoes && project.observacoes.trim());
    const hasHvac = !!(project.hvac && project.hvac.toUpperCase() === 'YES');
    
    let extraHeight = 0;
    if (hasObservation) extraHeight += 40;
    if (hasHvac) extraHeight += 25; // espaço para o ícone HVAC
    
    return baseHeight + extraHeight;
  };

  const getGroupHeight = (groupName: string) => {
    let maxColumnHeight = 0;

    timeColumns.forEach(col => {
      const projects = getProjectsForPeriod(groupName, col);
      const cardMargin = 8;
      const topPadding = 8;
      const columnHeight = topPadding + projects.reduce((sum, p) => sum + getCardHeight(p) + cardMargin, 0);
      if (columnHeight > maxColumnHeight) {
        maxColumnHeight = columnHeight;
      }
    });

    // Altura mínima quando não há projetos
    return maxColumnHeight === 0 ? 140 : maxColumnHeight;
  };

  // Obter projetos para um grupo e período específico
  const getProjectsForPeriod = (groupName: string, timeColumn: { month?: number; date?: string }) => {
    const groupProjects = groupedData.find(g => g.groupName === groupName)?.projects || [];
    
    let filteredProjects = groupProjects.filter(project => {
      // Exigir datas válidas de início e fim
      if (!project.previous_start_date || !project.previous_end_date) return false;
      const s = new Date(project.previous_start_date);
      const e = new Date(project.previous_end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
      
      if (showDays) {
        return timeColumn.date ? project.previous_start_date.startsWith(timeColumn.date) : false;
      } else {
        // Parse date string directly to avoid timezone issues
        const dateParts = project.previous_start_date.split('-');
        if (dateParts.length !== 3) return false;
        
        const projectYear = parseInt(dateParts[0]);
        const projectMonth = parseInt(dateParts[1]);
        
        // Se há filtro de ano, verificar se o projeto está no ano correto
        if (selectedYear && selectedYear !== '') {
          const selectedYearNum = parseInt(selectedYear);
          return projectMonth === timeColumn.month && projectYear === selectedYearNum;
        }
        
        // Se não há filtro de ano, apenas verificar o mês
        return projectMonth === timeColumn.month;
      }
    });

    // Aplicar ordenação por data se não estiver desligada
    if (sortByDate && sortByDate !== 'off') {
      filteredProjects = filteredProjects.sort((a, b) => {
        const dateA = new Date(a.previous_start_date || '1900-01-01');
        const dateB = new Date(b.previous_start_date || '1900-01-01');
        
        if (sortByDate === 'asc') {
          return dateA.getTime() - dateB.getTime();
        } else {
          return dateB.getTime() - dateA.getTime();
        }
      });
    }

    return filteredProjects;
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by Start Date</span>
                <button 
                  onClick={() => onSortByDateChange(sortByDate === 'asc' ? 'desc' : sortByDate === 'desc' ? null : 'asc')} 
                  style={{ 
                    background: sortByDate ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                    color: sortByDate ? '#fff' : 'var(--color-text-secondary)', 
                    border: '1px solid var(--color-border-divider)', 
                    borderRadius: 15, 
                    padding: '4px 10px', 
                    fontSize: 14, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    height: 26,
                    fontWeight: 500
                  }}
                >
                  {sortByDate === 'asc' ? 'ASC' : sortByDate === 'desc' ? 'DESC' : 'OFF'}
                </button>
              </div>

              {/* Botão para versão mobile */}
              <button
                onClick={() => navigate('/forecast')}
                style={{
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: 25,
                  padding: '6px 12px',
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: 'var(--color-text-primary)',
                  fontSize: 14,
                  fontWeight: 500
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-accent-primary)';
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--color-background-primary)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                }}
              >
                <i className="bi bi-phone" style={{ fontSize: 16 }} />
                Mobile View
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
                              {projects.map((project, projectIndex) => {
                                const projectStatus = getProjectStatus(project);
                                const statusColors = PROJECT_STATUS_COLORS[projectStatus];
                                
                                return (
                                <div
                                  key={project.id}
                                  draggable
                                style={{
                                  background: statusColors.primary,
                                  borderRadius: 6,
                                  padding: '10px',
                                  marginBottom: projectIndex < projects.length - 1 ? 8 : 0,
                                  color: 'white',
                                  fontSize: 12,
                                  cursor: 'grab',
                                  transition: 'all 0.2s ease',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  userSelect: 'none',
                                  height: getCardHeight(project),
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
                                      e.currentTarget.style.background = statusColors.hover;
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                      e.currentTarget.style.cursor = 'grab';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!draggedProject) {
                                      e.currentTarget.style.background = statusColors.primary;
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }
                                  }}
                                >
                                <div style={{ 
                                  color: 'white', 
                                  fontWeight: 600, 
                                  marginBottom: 4,
                                  fontSize: 12
                                }}>
                                  {project.cliente} • {project.job_site}
                                </div>
                                <div style={{ 
                                  fontSize: 12, 
                                  opacity: 0.9,
                                  marginBottom: 4,
                                  fontWeight: 'bold'
                                }}>
                                  {project.type || 'Lot'} {project.lote_building}
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
                                {project.hvac && project.hvac.toUpperCase() === 'YES' && (
                                  <div style={{ 
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 4
                                  }}>
                                    <img 
                                      src={iconForecastHvac} 
                                      alt="HVAC" 
                                      style={{ 
                                        width: '18px', 
                                        height: '18px',
                                        objectFit: 'contain'
                                      }} 
                                    />
                                  </div>
                                )}
                                {project.previous_start_date && project.previous_end_date && (
                                  <div style={{ 
                                    fontSize: 11, 
                                    opacity: 0.7
                                  }}>
                                    Start: {formatDateShort(project.previous_start_date)} | End: {formatDateShort(project.previous_end_date)}
                                  </div>
                                )}

                                {/* Observação (quando existir) */}
                                {project.observacoes && project.observacoes.trim() && (
                                  <div style={{
                                    marginTop: 6,
                                    padding: '6px 8px',
                                    background: 'rgba(0,0,0,0.15)',
                                    borderRadius: 6,
                                    color: 'rgba(255,255,255,0.95)',
                                    fontSize: 11,
                                    lineHeight: 1.3,
                                    maxHeight: 40,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {project.observacoes}
                                  </div>
                                )}
                                </div>
                                );
                              })}
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
