import React, { useState, useMemo } from 'react';
import { formatDateUS } from '../../../utils/formatters';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';

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

interface MobileTimelinePlannerProps {
  forecastData: ForecastData[];
  workforceProjects: WorkforceProject[];
  selectedYear: string;
  selectedMonth: string;
  groupBy: 'cliente' | 'job_site';
  onGroupByChange: (groupBy: 'cliente' | 'job_site') => void;
  sortByDate: 'off' | 'asc' | 'desc' | null;
  onSortByDateChange: (sortBy: 'off' | 'asc' | 'desc' | null) => void;
}

export default function MobileTimelinePlanner({
  forecastData,
  workforceProjects,
  selectedYear,
  selectedMonth,
  groupBy,
  onGroupByChange,
  sortByDate,
  onSortByDateChange
}: MobileTimelinePlannerProps) {
  const [selectedProject, setSelectedProject] = useState<WorkforceProject | null>(null);

  // Agrupar projetos por período
  const groupedProjects = useMemo(() => {
    if (!workforceProjects.length) return [];

    const filteredProjects = workforceProjects.filter(project => {
      // Excluir cards quando as datas forem nulas/indefinidas/inválidas
      if (!project.previous_start_date || !project.previous_end_date) return false;
      const start = new Date(project.previous_start_date);
      const end = new Date(project.previous_end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

      // Parse date string directly to avoid timezone issues
      const dateParts = project.previous_start_date.split('-');
      if (dateParts.length !== 3) return false;
      
      const projectYear = dateParts[0];
      const projectMonthNum = parseInt(dateParts[1]);
      const projectMonth = new Date(2024, projectMonthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;

      return yearMatch && monthMatch;
    });

    // Agrupar por mês
    const grouped: { [key: string]: WorkforceProject[] } = {};
    
    filteredProjects.forEach(project => {
      const startDate = new Date(project.previous_start_date);
      const monthKey = `${startDate.getFullYear()}-${startDate.getMonth()}`;
      const monthName = startDate.toLocaleString('en-US', { month: 'long' }) + ' / ' + startDate.getFullYear();
      
      if (!grouped[monthName]) {
        grouped[monthName] = [];
      }
      grouped[monthName].push(project);
    });

    // Ordenar por data
    Object.keys(grouped).forEach(month => {
      grouped[month].sort((a, b) => 
        new Date(a.previous_start_date).getTime() - new Date(b.previous_start_date).getTime()
      );
    });

    return Object.entries(grouped).sort(([a], [b]) => {
      const dateA = new Date(a.split(' / ')[1] + ' ' + a.split(' / ')[0]);
      const dateB = new Date(b.split(' / ')[1] + ' ' + b.split(' / ')[0]);
      return dateA.getTime() - dateB.getTime();
    });
  }, [workforceProjects, selectedYear, selectedMonth]);

  const formatDate = (dateString: string) => {
    return formatDateUS(dateString);
  };

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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'not-started': return 'Not Started';
      case 'in-progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'no-end-date': return 'No End Date';
      default: return 'N/A';
    }
  };

  if (groupedProjects.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--color-text-secondary)'
      }}>
        <i className="bi bi-calendar-x" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }} />
        <p style={{ margin: 0, fontSize: '16px' }}>
          No projects found for the selected filters
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '0 5px',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {groupedProjects.map(([month, projects]) => (
        <div key={month} style={{ marginBottom: '25px' }}>
          {/* Container do mês */}
          <div style={{
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}>
            {/* Cabeçalho do mês */}
            <div style={{
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--color-border-divider)'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                textTransform: 'capitalize'
              }}>
                {month}
              </h3>
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '14px',
                color: 'var(--color-text-secondary)'
              }}>
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Grid de cards dos projetos */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box'
            }}>
              {projects.map((project) => {
                const status = getProjectStatus(project);
                const statusColors = PROJECT_STATUS_COLORS[status];
                
                return (
                  <div
                    key={project.id}
                    style={{
                      background: statusColors.primary,
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      color: 'white'
                    }}
                    onClick={() => setSelectedProject(project)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = statusColors.hover;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = statusColors.primary;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                    }}
                  >
                    {/* Header do projeto */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '12px'
                    }}>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        flex: 1, 
                        minWidth: 0 
                      }}>
                        {/* Ícone HVAC */}
                        {project.hvac && project.hvac.toUpperCase() === 'YES' && (
                          <div style={{
                            flexShrink: 0,
                            marginTop: '2px'
                          }}>
                            <img 
                              src={iconForecastHvac} 
                              alt="HVAC" 
                              style={{ 
                                width: '20px', 
                                height: '20px',
                                objectFit: 'contain'
                              }} 
                            />
                          </div>
                        )}
                        
                        {/* Informações do projeto */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{
                            margin: 0,
                            fontSize: '16px',
                            fontWeight: 600,
                            color: 'white',
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {project.cliente}
                          </h4>
                          <p style={{
                            margin: '2px 0 0 0',
                            fontSize: '14px',
                            color: 'rgba(255,255,255,0.8)',
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {project.job_site}
                          </p>
                        </div>
                      </div>
                      
                      {/* Status badge */}
                      <div style={{
                        background: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        marginLeft: '8px'
                      }}>
                        {getStatusText(status)}
                      </div>
                    </div>

                    {/* Detalhes do projeto */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {/* Lot */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <i className="bi bi-geo-alt" style={{ 
                          color: 'rgba(255,255,255,0.8)', 
                          fontSize: '14px' 
                        }} />
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: 'white'
                        }}>
                          {project.type || 'Lot'} {project.lote_building}
                        </span>
                      </div>

                      {/* Datas */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <i className="bi bi-calendar-range" style={{ 
                          color: 'rgba(255,255,255,0.8)', 
                          fontSize: '14px' 
                        }} />
                        <span style={{
                          fontSize: '14px',
                          color: 'rgba(255,255,255,0.8)'
                        }}>
                          {formatDate(project.previous_start_date)} - {formatDate(project.previous_end_date)}
                        </span>
                      </div>

                      {/* Equipe */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <i className="bi bi-people" style={{ 
                          color: 'rgba(255,255,255,0.8)', 
                          fontSize: '14px' 
                        }} />
                        <span style={{
                          fontSize: '14px',
                          color: project.workforce ? 'white' : '#ffcc00',
                          fontWeight: project.workforce ? 'normal' : 'bold'
                        }}>
                          {project.workforce || 'No team assigned'}
                        </span>
                      </div>


                      {/* Observação (quando existir) */}
                      {project.observacoes && project.observacoes.trim() && (
                        <div style={{
                          marginTop: 4,
                          padding: '8px',
                          background: 'rgba(0,0,0,0.15)',
                          borderRadius: 6,
                          color: 'rgba(255,255,255,0.9)',
                          fontSize: '13px',
                          lineHeight: 1.3,
                          maxHeight: 44,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {project.observacoes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {/* Modal de detalhes do projeto */}
      {selectedProject && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 1000
        }}
        onClick={() => setSelectedProject(null)}
        >
          <div style={{
            background: 'var(--color-background-primary)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--color-text-primary)'
              }}>
                Project Details
              </h3>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onClick={() => setSelectedProject(null)}
              >
                <i className="bi bi-x" />
              </button>
            </div>

            {/* Conteúdo do modal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '4px',
                  display: 'block'
                }}>
                  Client
                </label>
                <p style={{
                  margin: 0,
                  fontSize: '16px',
                  color: 'var(--color-text-primary)',
                  fontWeight: 500
                }}>
                  {selectedProject.cliente}
                </p>
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '4px',
                  display: 'block'
                }}>
                  Work Location
                </label>
                <p style={{
                  margin: 0,
                  fontSize: '16px',
                  color: 'var(--color-text-primary)'
                }}>
                  {selectedProject.job_site}
                </p>
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '4px',
                  display: 'block'
                }}>
                  {selectedProject.type || 'Lot'}
                </label>
                <p style={{
                  margin: 0,
                  fontSize: '16px',
                  color: 'var(--color-text-primary)',
                  fontWeight: 'bold'
                }}>
                  {selectedProject.type || 'Lot'} {selectedProject.lote_building}
                </p>
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '4px',
                  display: 'block'
                }}>
                  Period
                </label>
                <p style={{
                  margin: 0,
                  fontSize: '16px',
                  color: 'var(--color-text-primary)'
                }}>
                  {formatDate(selectedProject.previous_start_date)} - {formatDate(selectedProject.previous_end_date)}
                </p>
              </div>

              <div>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'var(--color-text-secondary)',
                  marginBottom: '4px',
                  display: 'block'
                }}>
                  Team
                </label>
                <p style={{
                  margin: 0,
                  fontSize: '16px',
                  color: selectedProject.workforce ? 'var(--color-text-primary)' : '#ffcc00',
                  fontWeight: selectedProject.workforce ? 'normal' : 'bold'
                }}>
                  {selectedProject.workforce || 'No team assigned'}
                </p>
              </div>

              {selectedProject.hvac && selectedProject.hvac.toUpperCase() === 'YES' && (
                <div>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: '4px',
                    display: 'block'
                  }}>
                    HVAC
                  </label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <img 
                      src={iconForecastHvac} 
                      alt="HVAC" 
                      style={{ 
                        width: '24px', 
                        height: '24px',
                        objectFit: 'contain'
                      }} 
                    />
                    <p style={{
                      margin: 0,
                      fontSize: '16px',
                      color: 'var(--color-text-primary)',
                      fontWeight: '500'
                    }}>
                      HVAC Required
                    </p>
                  </div>
                </div>
              )}

              {selectedProject.observacoes && (
                <div>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                    marginBottom: '4px',
                    display: 'block'
                  }}>
                    Notes
                  </label>
                  <p style={{
                    margin: 0,
                    fontSize: '16px',
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.4
                  }}>
                    {selectedProject.observacoes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
