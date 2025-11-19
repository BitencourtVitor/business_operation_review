import React, { useState, useMemo } from 'react';
import { formatDateUS } from '../../../utils/formatters';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconFieldwire from '../../../assets/fieldwire.png';

const POSITIVE_STRINGS = ['yes', 'sim', 'true', '1', 'y'];
const indicatorWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  alignItems: 'center'
};
const indicatorIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const isTruthyFlag = (value?: string | boolean | null): boolean => {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = value.toString().toLowerCase().trim();
  if (!normalized) return false;
  return POSITIVE_STRINGS.includes(normalized);
};

interface WorkforceProject {
  id: number;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_building: number;
  workforce: string;
  hvac: string | null;
  fieldwire?: boolean | string | null;
  tem_contrato?: boolean | string | null;
  status?: string | null;
  address?: string | null;
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

  // Status somente pelo campo status (apenas 'open' ou 'not-started')
  const getProjectStatus = (project: WorkforceProject): 'not-started' | 'open' => {
    const normalizedStatus = (project.status || '').toLowerCase().trim();
    if (normalizedStatus === 'open') return 'open';
    // 'closed' já é filtrado fora na busca; qualquer outro vira 'not-started'
    return 'not-started';
  };

  // Atraso: somente quando status é 'not started' e data de início já passou
  // Retorna tipo de atraso: 'start' (não iniciou) ou 'end' (passou do fim mas segue open)
  const getOverdueType = (project: WorkforceProject): 'start' | 'end' | null => {
    const normalizedStatus = (project.status || '').toLowerCase().trim();
    const today = new Date();
    const startDate = project.previous_start_date ? new Date(project.previous_start_date) : null;
    const endDate = project.previous_end_date ? new Date(project.previous_end_date) : null;
    if (normalizedStatus === 'not started' && startDate && today > startDate) return 'start';
    if (normalizedStatus === 'open' && endDate && today > endDate) return 'end';
    return null;
  };

  // Cores para cada status principal
  const PROJECT_STATUS_COLORS = {
    'not-started': {
      primary: '#6c757d', // Cinza
      hover: '#5a6268'     // Cinza mais escuro
    },
    'open': {
      primary: '#28a745',  // Verde
      hover: '#218838'     // Verde mais escuro
    }
  } as const;

  const getStatusText = (status: string) => {
    switch (status) {
      case 'not-started': return 'Not Started';
      case 'open': return 'Open';
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
                const overdue = !!getOverdueType(project);
                const statusColors = PROJECT_STATUS_COLORS[status as keyof typeof PROJECT_STATUS_COLORS] || PROJECT_STATUS_COLORS['not-started'];
                const overdueColors = { primary: '#e04b4b', hover: '#c73f3f' }; // vermelho mais marcante
                const cardColors = overdue ? overdueColors : statusColors;
                
                return (
                  <div
                    key={project.id}
                    style={{
                      background: cardColors.primary,
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
                      e.currentTarget.style.background = cardColors.hover;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = cardColors.primary;
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
                        {/* Informações do projeto (alinhadas à esquerda) */}
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
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
                          {/* Endereço removido do header: será exibido apenas nos detalhes abaixo */}
                        </div>
                      </div>

                      {/* Coluna direita: status em cima e ícone HVAC abaixo */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                        {/* Status badge */}
                        <div style={{
                          background: overdue ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255,255,255,0.2)',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}>
                          {overdue && (
                            <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 12 }} />
                          )}
                          {overdue ? 'Overdue' : getStatusText(status)}
                        </div>

                        {/* Ícone HVAC abaixo do status, alinhado à direita */}
                        {(project.hvac && project.hvac.toUpperCase() === 'YES') || isTruthyFlag(project.fieldwire) ? (
                          <div style={indicatorWrapperStyle}>
                            {project.hvac && project.hvac.toUpperCase() === 'YES' && (
                              <div style={indicatorIconStyle}>
                                <img 
                                  src={iconForecastHvac} 
                                  alt="HVAC" 
                                  style={{ 
                                    width: 18, 
                                    height: 18,
                                    objectFit: 'contain',
                                    opacity: 0.95
                                  }} 
                                />
                              </div>
                            )}
                            {isTruthyFlag(project.fieldwire) && (
                              <div style={indicatorIconStyle}>
                                <img 
                                  src={iconFieldwire} 
                                  alt="Fieldwire" 
                                  style={{ width: 18, height: 18, objectFit: 'contain' }}
                                />
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Detalhes do projeto */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {/* Address (quando existir) */}
                      {project.address && project.address.trim() && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <i className="bi bi-geo-alt-fill" style={{ 
                            color: 'rgba(255,255,255,0.9)', 
                            fontSize: '14px' 
                          }} />
                          <span style={{
                            fontSize: '14px',
                            color: 'rgba(255,255,255,0.95)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {project.address}
                          </span>
                        </div>
                      )}

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
                        {isTruthyFlag(project.tem_contrato) && (
                          <i className="bi bi-file-earmark-check" style={{ 
                            color: '#20c997', 
                            fontSize: '16px' 
                          }} />
                        )}
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
            borderRadius: '16px',
            padding: '18px',
            maxWidth: '420px',
            width: '100%',
            maxHeight: '82vh',
            overflow: 'auto',
            border: '1px solid var(--color-border-divider)',
            boxShadow: '0 12px 28px rgba(0,0,0,0.25)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal moderno */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedProject.cliente}
                  </h3>
                  {(() => {
                    const st = getProjectStatus(selectedProject);
                    const overdue = !!getOverdueType(selectedProject);
                    return (
                      <span style={{
                        background: overdue ? 'rgba(224,75,75,0.15)' : 'var(--color-background-secondary)',
                        color: overdue ? '#e04b4b' : 'var(--color-text-secondary)',
                        border: overdue ? '1px solid #e04b4b' : '1px solid var(--color-border-divider)',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 12
                      }}>
                        {overdue ? 'Overdue' : (st === 'open' ? 'Open' : 'Not Started')}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', fontSize: 13, overflow: 'hidden' }}>
                  <i className="bi bi-geo-alt" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProject.job_site}</span>
                </div>
                {selectedProject.address && selectedProject.address.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', fontSize: 13, overflow: 'hidden' }}>
                    <i className="bi bi-geo-alt-fill" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProject.address}</span>
                  </div>
                )}
              </div>
              <button
                style={{
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-divider)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: 8,
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onClick={() => setSelectedProject(null)}
              >
                <i className="bi bi-x" style={{ fontSize: 20 }} />
              </button>
            </div>

            {/* Chips informativos */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)',
                borderRadius: 24, padding: '6px 10px', fontSize: 12, color: 'var(--color-text-primary)'
              }}>
                <i className="bi bi-building" />
                <span>{selectedProject.type || 'Lot'} {selectedProject.lote_building}</span>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)',
                borderRadius: 24, padding: '6px 10px', fontSize: 12, color: 'var(--color-text-primary)'
              }}>
                <i className="bi bi-calendar-range" />
                <span>{formatDate(selectedProject.previous_start_date)} - {formatDate(selectedProject.previous_end_date)}</span>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)',
                borderRadius: 24, padding: '6px 10px', fontSize: 12,
                color: selectedProject.workforce ? 'var(--color-text-primary)' : '#ffcc00',
                fontWeight: selectedProject.workforce ? 500 : 700
              }}>
                <i className="bi bi-people" />
                <span>{selectedProject.workforce || 'No team assigned'}</span>
              </div>
                      {selectedProject.hvac && selectedProject.hvac.toUpperCase() === 'YES' && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)',
                          borderRadius: 24, padding: '4px 8px', fontSize: 12, color: 'var(--color-text-primary)'
                        }}>
                          <img src={iconForecastHvac} alt="HVAC" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                          <span>HVAC</span>
                        </div>
                      )}
                      {isTruthyFlag(selectedProject.fieldwire) && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)',
                          borderRadius: 24, padding: '4px 10px', fontSize: 12, color: 'var(--color-text-primary)'
                        }}>
                          <img src={iconFieldwire} alt="Fieldwire" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                          <span>Fieldwire</span>
                        </div>
                      )}
                      {isTruthyFlag(selectedProject.tem_contrato) && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)',
                          borderRadius: 24, padding: '4px 10px', fontSize: 12, color: 'var(--color-text-primary)'
                        }}>
                          <i className="bi bi-file-earmark-check" />
                          <span>Contrato</span>
                        </div>
                      )}
            </div>

            {/* Observações */}
            {selectedProject.observacoes && selectedProject.observacoes.trim() && (
              <div style={{
                background: 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 10,
                padding: '10px 12px',
                color: 'var(--color-text-primary)',
                fontSize: 13,
                lineHeight: 1.35
              }}>
                {selectedProject.observacoes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
