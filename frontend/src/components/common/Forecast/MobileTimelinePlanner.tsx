import React, { useState, useMemo } from 'react';

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
      const projectYear = new Date(project.previous_start_date).getFullYear().toString();
      const projectMonth = new Date(project.previous_start_date).toLocaleString('en-US', { month: 'long' });
      
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
    return new Date(dateString).toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getProjectStatus = (project: WorkforceProject) => {
    const today = new Date();
    const startDate = new Date(project.previous_start_date);
    const endDate = new Date(project.previous_end_date);
    
    if (today < startDate) return 'upcoming';
    if (today >= startDate && today <= endDate) return 'current';
    return 'completed';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return '#6c757d';
      case 'current': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'upcoming': return 'Upcoming';
      case 'current': return 'In Progress';
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
                const statusColor = getStatusColor(status);
                
                return (
                  <div
                    key={project.id}
                    style={{
                      background: 'var(--color-background-primary)',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '8px',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}
                    onClick={() => setSelectedProject(project)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-background-secondary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--color-background-primary)';
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{
                          margin: 0,
                          fontSize: '16px',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          lineHeight: 1.3
                        }}>
                          {project.cliente}
                        </h4>
                        <p style={{
                          margin: '2px 0 0 0',
                          fontSize: '14px',
                          color: 'var(--color-text-secondary)',
                          lineHeight: 1.3
                        }}>
                          {project.job_site}
                        </p>
                      </div>
                      
                      {/* Status badge - apenas para upcoming */}
                      {status === 'upcoming' && (
                        <div style={{
                          background: statusColor,
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
                      )}
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
                          color: 'var(--color-accent-primary)', 
                          fontSize: '14px' 
                        }} />
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: 'var(--color-text-primary)'
                        }}>
                          Lot {project.lote_building}
                        </span>
                      </div>

                      {/* Datas */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <i className="bi bi-calendar-range" style={{ 
                          color: 'var(--color-text-secondary)', 
                          fontSize: '14px' 
                        }} />
                        <span style={{
                          fontSize: '14px',
                          color: 'var(--color-text-secondary)'
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
                          color: 'var(--color-text-secondary)', 
                          fontSize: '14px' 
                        }} />
                        <span style={{
                          fontSize: '14px',
                          color: project.workforce ? 'var(--color-text-primary)' : '#ffcc00',
                          fontWeight: project.workforce ? 'normal' : 'bold'
                        }}>
                          {project.workforce || 'No team assigned'}
                        </span>
                      </div>
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
                  Lot
                </label>
                <p style={{
                  margin: 0,
                  fontSize: '16px',
                  color: 'var(--color-text-primary)',
                  fontWeight: 'bold'
                }}>
                  {selectedProject.lote_building}
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
