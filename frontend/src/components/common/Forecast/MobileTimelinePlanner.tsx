import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatDateUS } from '../../../utils/formatters';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';
import iconBoomlift from '../../../assets/boomlift.png';
import iconForklift from '../../../assets/forklift.png';

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

// Helper para verificar se tem Fieldwire ativo
const hasActiveFieldwire = (project: WorkforceProject): boolean => {
  return project.fieldwire?.some(fw => fw.status === true) || false;
};

// Helper para verificar se Fieldwire está completo (todos os documentos com status true)
const isFieldwireComplete = (project: WorkforceProject): boolean => {
  if (!project.fieldwire || project.fieldwire.length === 0) return false;
  return project.fieldwire.every(fw => fw.status === true);
};

// Helper para verificar se tem contrato completo
const hasCompleteContract = (project: WorkforceProject): boolean => {
  if (!project.contract_steps || project.contract_steps.length === 0) return false;
  return project.contract_steps.every(cs => cs.status === true);
};

// Helper para calcular porcentagem de contratos completos
const getContractProgress = (project: WorkforceProject): number => {
  if (!project.contract_steps || project.contract_steps.length === 0) return 0;
  const completed = project.contract_steps.filter(cs => cs.status === true).length;
  return (completed / project.contract_steps.length) * 100;
};

// Helper para calcular porcentagem de Fieldwire completo
const getFieldwireProgress = (project: WorkforceProject): number => {
  if (!project.fieldwire || project.fieldwire.length === 0) return 0;
  const completed = project.fieldwire.filter(fw => fw.status === true).length;
  return (completed / project.fieldwire.length) * 100;
};

// Helper para calcular porcentagem de máquinas ativas
const getMachinesProgress = (project: WorkforceProject): number => {
  if (!project.machines || project.machines.length === 0) return 0;
  const active = project.machines.filter(m => m.status === true).length;
  return (active / project.machines.length) * 100;
};

// Helper para contar máquinas ativas
const getActiveMachinesCount = (project: WorkforceProject): number => {
  return project.machines?.filter(m => m.status === true).length || 0;
};

// Helper para encontrar máquinas específicas (busca flexível)
const getMachineByTitle = (project: WorkforceProject, searchTerm: string): ForecastMachine | null => {
  if (!project.machines) return null;
  const normalizedSearch = searchTerm.toLowerCase().trim().replace(/\s+/g, '');
  return project.machines.find(m => {
    const machineTitle = m.title?.toLowerCase().trim().replace(/\s+/g, '') || '';
    return machineTitle.includes(normalizedSearch) || normalizedSearch.includes(machineTitle);
  }) || null;
};

interface ForecastFieldwire {
  id: number;
  obra_id: string;
  category: string | null;
  document: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

interface ForecastMachine {
  id: number;
  obra_id: string;
  category: string | null;
  subcategory: string | null;
  equipment_category: string | null;
  title: string | null;
  status: boolean | null;
  unit: string | null;
  lastupdate_datetimez: string | null;
}

interface ForecastContractStep {
  id: number;
  obra_id: string;
  step: string | null;
  status: boolean | null;
  lastupdate_datetimez: string | null;
}

interface WorkforceProject {
  id: string;
  cliente: string;
  job_site: string;
  type: string | null;
  lote_bld: string | null;
  workforce: string | null;
  hvac: boolean | null;
  buildertrend: boolean | null;
  machine_provider: string | null;
  status: string | null;
  address: string | null;
  previous_beams_date: string | null;
  previous_start_date: string | null;
  previous_end_date: string | null;
  obs: string | null;
  create_datetime: string | null;
  lastupdate_datetimez: string | null;
  fieldwire?: ForecastFieldwire[];
  machines?: ForecastMachine[];
  contract_steps?: ForecastContractStep[];
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
  dateMode: 'start' | 'beams';
  onDateModeChange: (mode: 'start' | 'beams') => void;
}

export default function MobileTimelinePlanner({
  forecastData,
  workforceProjects,
  selectedYear,
  selectedMonth,
  groupBy,
  onGroupByChange,
  sortByDate,
  onSortByDateChange,
  dateMode,
  onDateModeChange
}: MobileTimelinePlannerProps) {
  const [selectedProject, setSelectedProject] = useState<WorkforceProject | null>(null);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);
  const resolveReferenceDate = (project: WorkforceProject) => {
    const ref = dateMode === 'beams'
      ? (project.previous_beams_date || project.previous_start_date)
      : project.previous_start_date;
    return ref || '';
  };
  const dateModeLabel = dateMode === 'beams' ? 'Beams Date' : 'Start Date';

  // Agrupar projetos por período
  const groupedProjects = useMemo(() => {
    if (!workforceProjects.length) return [];

    const filteredProjects = workforceProjects.filter(project => {
      // Excluir cards quando as datas forem nulas/indefinidas/inválidas
      if (!project.previous_start_date || !project.previous_end_date) return false;
      const start = new Date(project.previous_start_date);
      const end = new Date(project.previous_end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

      const referenceDate = resolveReferenceDate(project);
      if (!referenceDate) return false;

      // Parse date string directly to avoid timezone issues
      const dateParts = referenceDate.split('-');
      if (dateParts.length !== 3) return false;
      
      const projectYear = dateParts[0];
      const projectMonthNum = parseInt(dateParts[1], 10);
      const projectMonth = new Date(2024, projectMonthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
      
      const yearMatch = !selectedYear || projectYear === selectedYear;
      const monthMatch = !selectedMonth || projectMonth === selectedMonth;

      return yearMatch && monthMatch;
    });

    // Agrupar por mês
    const grouped: { [key: string]: WorkforceProject[] } = {};
    
    filteredProjects.forEach(project => {
      const referenceDate = resolveReferenceDate(project);
      if (!referenceDate) {
        return;
      }
      const baseDate = new Date(referenceDate);
      if (isNaN(baseDate.getTime())) {
        return;
      }
      const monthKey = `${baseDate.getFullYear()}-${baseDate.getMonth()}`;
      const monthName = baseDate.toLocaleString('en-US', { month: 'long' }) + ' / ' + baseDate.getFullYear();
      
      if (!grouped[monthName]) {
        grouped[monthName] = [];
      }
      grouped[monthName].push(project);
    });

    // Ordenar por data
    Object.keys(grouped).forEach(month => {
      grouped[month].sort((a, b) => {
        const dateA = new Date(resolveReferenceDate(a) || '1900-01-01').getTime();
        const dateB = new Date(resolveReferenceDate(b) || '1900-01-01').getTime();
        if (sortByDate === 'desc') {
          return dateB - dateA;
        }
        if (sortByDate === 'asc') {
          return dateA - dateB;
        }
        return dateA - dateB;
      });
    });

    return Object.entries(grouped).sort(([a], [b]) => {
      const dateA = new Date(a.split(' / ')[1] + ' ' + a.split(' / ')[0]);
      const dateB = new Date(b.split(' / ')[1] + ' ' + b.split(' / ')[0]);
      return dateA.getTime() - dateB.getTime();
    });
  }, [workforceProjects, selectedYear, selectedMonth, dateMode, sortByDate]);

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
      maxWidth: '100vw',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <div style={{
        marginBottom: '15px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: 10,
          padding: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="bi bi-calendar-week" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Date Mode
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onDateModeChange('beams')}
              style={{
                background: dateMode === 'beams' ? '#17a2b8' : 'transparent',
                color: dateMode === 'beams' ? '#fff' : 'var(--color-text-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className="bi bi-flag-fill" style={{ fontSize: 12 }} />
              Beams
            </button>
            <button
              onClick={() => onDateModeChange('start')}
              style={{
                background: dateMode === 'start' ? 'var(--color-accent-primary)' : 'transparent',
                color: dateMode === 'start' ? '#fff' : 'var(--color-text-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className="bi bi-calendar" style={{ fontSize: 12 }} />
              Start
            </button>
          </div>
        </div>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <button
            onClick={() => onSortByDateChange(sortByDate === 'asc' ? 'desc' : sortByDate === 'desc' ? 'asc' : 'asc')}
            style={{
              flex: 1,
              background: sortByDate ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)',
              color: sortByDate ? '#fff' : 'var(--color-text-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer'
            }}
          >
            <span>Sort by {dateModeLabel}</span>
            <span>{sortByDate ? sortByDate.toUpperCase() : 'OFF'}</span>
          </button>
          {sortByDate && (
            <button
              onClick={() => onSortByDateChange(null)}
              style={{
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              OFF
            </button>
          )}
        </div>
      </div>
      {groupedProjects.map(([month, projects]) => (
        <div key={month} style={{ marginBottom: '25px' }}>
          {/* Container do mês */}
          <div style={{
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden'
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              alignContent: 'start',
              alignItems: 'start'
            }}>
              {projects.map((project) => {
                const overdue = !!getOverdueType(project);
                const borderColor = overdue ? '#e04b4b' : '#6c757d';
                const shadowColor = overdue ? 'rgba(224, 75, 75, 0.2)' : 'rgba(108, 117, 125, 0.15)';
                
                // Helpers para ícones
                const boomlift = getMachineByTitle(project, 'boomlift');
                const forklift = getMachineByTitle(project, 'forklift');
                const fieldwireProgress = getFieldwireProgress(project);
                const fieldwireComplete = isFieldwireComplete(project);
                const machinesProgress = getMachinesProgress(project);
                const machinesComplete = project.machines && project.machines.length > 0 && project.machines.every(m => m.status === true);
                const contractProgress = getContractProgress(project);
                const contractComplete = hasCompleteContract(project);
                
                return (
                  <div
                    key={project.id}
                    style={{
                      background: 'var(--color-background-primary)',
                      border: `1px solid ${borderColor}`,
                      borderRadius: '12px',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: `0 2px 8px ${shadowColor}`,
                      width: '100%',
                      minWidth: 0,
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                    onClick={() => {
                      setSelectedProject(project);
                      setActiveSection('overview');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${shadowColor}`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 2px 8px ${shadowColor}`;
                    }}
                  >
                    {/* Parte Superior - Dividida em Esquerda e Direita */}
                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      marginBottom: '16px'
                    }}>
                      {/* Lado Esquerdo - Informações principais */}
                      <div style={{ 
                        flex: 1, 
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        {/* Cliente e Job Site - Alinhados à esquerda */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          flex: 1
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            justifyContent: 'space-between'
                          }}>
                            <h4 style={{
                              margin: 0,
                              fontSize: '16px',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                              lineHeight: 1.3,
                              textAlign: 'left',
                              flex: 1
                            }}>
                              {project.cliente}
                            </h4>
                            {/* Alerta de atraso - à direita do Cliente */}
                            {overdue && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: '#e04b4b',
                                fontSize: '13px',
                                fontWeight: 600,
                                flexShrink: 0
                              }}>
                                <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14 }} />
                                <span>Overdue</span>
                              </div>
                            )}
                          </div>
                          <p style={{
                            margin: 0,
                            fontSize: '14px',
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.3,
                            textAlign: 'left'
                          }}>
                            {project.job_site}
                          </p>
                        </div>
                        
                        {/* Address - Com quebra de linha, alinhado à esquerda */}
                        {project.address && project.address.trim() && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '6px',
                            fontSize: '13px',
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.4,
                            textAlign: 'left'
                          }}>
                            <i className="bi bi-geo-alt-fill" style={{ fontSize: 12, marginTop: '2px', flexShrink: 0 }} />
                            <span style={{
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              textAlign: 'left'
                            }}>
                              {project.address}
                            </span>
                          </div>
                        )}
                        
                        {/* Lot */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)'
                        }}>
                          <i className="bi bi-geo-alt" style={{ fontSize: 12 }} />
                          <span>{project.type || 'Lot'} {project.lote_bld || 'N/A'}</span>
                        </div>
                        
                        {/* Equipe */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          color: project.workforce ? 'var(--color-text-primary)' : '#ffcc00',
                          fontWeight: project.workforce ? 400 : 600
                        }}>
                          {hasCompleteContract(project) && (
                            <i className="bi bi-file-earmark-check" style={{ fontSize: 14, color: '#20c997' }} />
                          )}
                          <i className="bi bi-people" style={{ fontSize: 12 }} />
                          <span>{project.workforce || 'No team assigned'}</span>
                        </div>
                        
                        {/* Machine Provider */}
                        {project.machine_provider && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            color: 'var(--color-text-secondary)'
                          }}>
                            <i className="bi bi-truck" style={{ fontSize: 12 }} />
                            <span>{project.machine_provider}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Lado Direito - Ícones em quadrados */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        alignItems: 'flex-end',
                        flexShrink: 0
                      }}>
                        {/* HVAC - Sempre no topo, borda cinza (presença, não conclusão) */}
                        {project.hvac === true && (
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            border: '1px solid #6c757d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--color-background-secondary)'
                          }}>
                            <img 
                              src={iconForecastHvac} 
                              alt="HVAC" 
                              style={{ width: 18, height: 18, objectFit: 'contain' }}
                            />
                          </div>
                        )}
                        
                        {/* Fieldwire - Borda progressiva */}
                        {hasActiveFieldwire(project) && (
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--color-background-secondary)',
                            position: 'relative',
                            overflow: 'hidden'
                          }}>
                            {/* SVG para borda externa com progresso */}
                            <svg width="30" height="30" style={{ position: 'absolute', top: 0, left: 0 }}>
                              <rect
                                x="0.5"
                                y="0.5"
                                width="29"
                                height="29"
                                rx="5.5"
                                fill="none"
                                stroke={fieldwireComplete ? '#4ade80' : (fieldwireProgress > 0 ? '#fbbf24' : '#6c757d')}
                                strokeWidth="1"
                                strokeDasharray={fieldwireComplete 
                                  ? '105 0' 
                                  : fieldwireProgress > 0
                                  ? `${(fieldwireProgress / 100) * 105} 105`
                                  : '0 105'}
                                strokeDashoffset="0"
                              />
                            </svg>
                            <img 
                              src={iconFieldwire} 
                              alt="Fieldwire" 
                              style={{ width: 18, height: 18, objectFit: 'contain', zIndex: 1, position: 'relative' }}
                            />
                          </div>
                        )}
                        
                        {/* BuilderTrend */}
                        {project.buildertrend === true && (
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            border: `1px solid ${project.buildertrend ? '#4ade80' : '#6c757d'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--color-background-secondary)'
                          }}>
                            <img 
                              src={iconBuildertrend} 
                              alt="BuilderTrend" 
                              style={{ width: 18, height: 18, objectFit: 'contain' }}
                            />
                          </div>
                        )}
                        
                        {/* Machines and Attachments - Borda progressiva baseada no total de máquinas */}
                        {project.machines && project.machines.length > 0 && (
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--color-background-secondary)',
                            position: 'relative',
                            overflow: 'hidden'
                          }}>
                            {/* SVG para borda externa com progresso */}
                            <svg width="30" height="30" style={{ position: 'absolute', top: 0, left: 0 }}>
                              <rect
                                x="0.5"
                                y="0.5"
                                width="29"
                                height="29"
                                rx="5.5"
                                fill="none"
                                stroke={machinesComplete ? '#4ade80' : (machinesProgress > 0 ? '#fbbf24' : '#6c757d')}
                                strokeWidth="1"
                                strokeDasharray={machinesComplete 
                                  ? '105 0' 
                                  : machinesProgress > 0
                                  ? `${(machinesProgress / 100) * 105} 105`
                                  : '0 105'}
                                strokeDashoffset="0"
                              />
                            </svg>
                            <i className="bi bi-truck" style={{ 
                              fontSize: 16, 
                              color: 'var(--color-text-primary)',
                              zIndex: 1,
                              position: 'relative'
                            }} />
                          </div>
                        )}
                        
                        {/* Contrato - Borda externa quadrada mostra progresso das etapas */}
                        {project.contract_steps && project.contract_steps.length > 0 && (
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--color-background-secondary)',
                            position: 'relative',
                            overflow: 'hidden'
                          }}>
                            {/* SVG para borda externa com progresso (retangular arredondado) */}
                            <svg width="30" height="30" style={{ position: 'absolute', top: 0, left: 0 }}>
                              <rect
                                x="0.5"
                                y="0.5"
                                width="29"
                                height="29"
                                rx="5.5"
                                fill="none"
                                stroke={contractComplete ? '#4ade80' : (contractProgress > 0 ? '#fbbf24' : '#6c757d')}
                                strokeWidth="1"
                                strokeDasharray={contractComplete 
                                  ? '105 0' 
                                  : contractProgress > 0
                                  ? `${(contractProgress / 100) * 105} 105`
                                  : '0 105'}
                                strokeDashoffset="0"
                              />
                            </svg>
                            <i className={`bi ${contractComplete ? 'bi-file-earmark-check' : 'bi-file-earmark'}`} style={{ 
                              fontSize: 14, 
                              color: contractComplete ? '#4ade80' : 'var(--color-text-secondary)',
                              zIndex: 1 
                            }} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Componente de Datas - Compacto, dividido em 3 partes (acima das observações) */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '8px',
                      marginBottom: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--color-border-divider)',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}>
                      {/* Beams Date */}
                      <div style={{
                        background: 'var(--color-background-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 8,
                        padding: '8px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        minWidth: 0,
                        overflow: 'hidden',
                        boxSizing: 'border-box'
                      }}>
                        <i className="bi bi-flag-fill" style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          flexShrink: 0
                        }} />
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 400,
                          color: 'var(--color-text-primary)',
                          textAlign: 'center',
                          lineHeight: 1.2,
                          minWidth: 0,
                          flex: 1
                        }}>
                          {project.previous_beams_date ? formatDate(project.previous_beams_date) : 'N/A'}
                        </div>
                      </div>
                      
                      {/* Start Date */}
                      <div style={{
                        background: 'var(--color-background-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 8,
                        padding: '8px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        minWidth: 0,
                        overflow: 'hidden',
                        boxSizing: 'border-box'
                      }}>
                        <i className="bi bi-calendar" style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          flexShrink: 0
                        }} />
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 400,
                          color: 'var(--color-text-primary)',
                          textAlign: 'center',
                          lineHeight: 1.2,
                          minWidth: 0,
                          flex: 1
                        }}>
                          {project.previous_start_date ? formatDate(project.previous_start_date) : 'N/A'}
                        </div>
                      </div>
                      
                      {/* End Date */}
                      <div style={{
                        background: 'var(--color-background-secondary)',
                        border: '1px solid var(--color-border-divider)',
                        borderRadius: 8,
                        padding: '8px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        minWidth: 0,
                        overflow: 'hidden',
                        boxSizing: 'border-box'
                      }}>
                        <i className="bi bi-calendar-check" style={{ 
                          fontSize: 12, 
                          color: 'var(--color-text-secondary)',
                          flexShrink: 0
                        }} />
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 400,
                          color: 'var(--color-text-primary)',
                          textAlign: 'center',
                          lineHeight: 1.2,
                          minWidth: 0,
                          flex: 1
                        }}>
                          {project.previous_end_date ? formatDate(project.previous_end_date) : 'N/A'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Parte Inferior - Observações */}
                    {project.obs && project.obs.trim() && (
                      <div style={{
                        paddingTop: '16px',
                        borderTop: '1px solid var(--color-border-divider)'
                      }}>
                        <div style={{
                          padding: '14px',
                          background: 'var(--color-background-secondary)',
                          borderRadius: 10,
                          color: 'var(--color-text-primary)',
                          fontSize: '13px',
                          lineHeight: 1.6
                        }}>
                          {project.obs}
                        </div>
                      </div>
                    )}
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
          zIndex: 1000,
          overflow: 'hidden'
        }}
        onClick={() => {
          setSelectedProject(null);
          setActiveSection('overview');
        }}
        >
          {/* Scroll Spy Navigation - Fora do modal, ao lado */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginRight: '12px',
            background: 'var(--color-background-primary)',
            padding: '8px 4px',
            borderRadius: '12px',
            border: '1px solid var(--color-border-divider)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            alignSelf: 'center'
          }}>
            {[
              { id: 'overview', icon: 'bi-info-circle', label: 'Overview', image: null },
              ...(selectedProject.fieldwire && selectedProject.fieldwire.length > 0 ? [{ id: 'fieldwire', icon: null, label: 'Fieldwire', image: iconFieldwire }] : []),
              { id: 'buildertrend', icon: null, label: 'BuilderTrend', image: iconBuildertrend },
              ...(selectedProject.machines && selectedProject.machines.length > 0 ? [{ id: 'machines', icon: 'bi-truck', label: 'Machines', image: null }] : []),
              ...(selectedProject.contract_steps && selectedProject.contract_steps.length > 0 ? [{ id: 'contract', icon: 'bi-file-check', label: 'Contract', image: null }] : [])
            ].map((section) => (
              <button
                key={section.id}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  // Define imediatamente a seção ativa antes do scroll
                  setActiveSection(section.id);
                  
                  const element = document.getElementById(`modal-section-${section.id}`);
                  const scrollContainer = modalScrollContainerRef.current;
                  if (element && scrollContainer) {
                    // Calcula a posição relativa do elemento dentro do container scrollável
                    const elementTop = element.offsetTop;
                    
                    scrollContainer.scrollTo({
                      top: Math.max(0, elementTop - 20),
                      behavior: 'smooth'
                    });
                  }
                }}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeSection === section.id 
                    ? 'var(--color-accent-primary)' 
                    : 'var(--color-background-secondary)',
                  color: activeSection === section.id 
                    ? '#fff' 
                    : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  fontSize: section.image ? '0' : '18px',
                  padding: section.image ? '4px' : '0'
                }}
                title={section.label}
              >
                {section.image ? (
                  <img src={section.image} alt={section.label} style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                ) : (
                  <i className={`bi ${section.icon}`} />
                )}
              </button>
            ))}
          </div>

          <div 
          ref={modalScrollRef}
          style={{
            background: 'var(--color-background-primary)',
            borderRadius: '16px',
            maxWidth: '420px',
            width: '100%',
            maxHeight: '82vh',
            overflow: 'hidden',
            border: '1px solid var(--color-border-divider)',
            boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header fixo do modal */}
            <div style={{
              padding: '16px 18px',
              borderBottom: '1px solid var(--color-border-divider)',
              background: 'var(--color-background-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>{selectedProject.cliente}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 2 }}>{selectedProject.job_site}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{selectedProject.type || 'Lot'} {selectedProject.lote_bld || 'N/A'}</div>
              </div>
              <button
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: 4,
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedProject(null);
                  setActiveSection('overview');
                }}
              >
                <i className="bi bi-x" style={{ fontSize: 18 }} />
              </button>
            </div>

            {/* Conteúdo scrollável */}
            <div 
            ref={modalScrollContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '18px'
            }}
            className="modal-scroll-container"
            onScroll={(e) => {
              const container = e.currentTarget;
              const scrollTop = container.scrollTop;
              const viewportMiddle = scrollTop + container.clientHeight / 2;
              
              // Ordem das seções conforme aparecem no modal
              const sections = [
                'overview',
                ...(selectedProject.fieldwire && selectedProject.fieldwire.length > 0 ? ['fieldwire'] : []),
                'buildertrend',
                ...(selectedProject.machines && selectedProject.machines.length > 0 ? ['machines'] : []),
                ...(selectedProject.contract_steps && selectedProject.contract_steps.length > 0 ? ['contract'] : [])
              ];
              
              // Verifica qual seção está mais próxima do meio da viewport
              let activeId = sections[0]; // Default para primeira seção
              let minDistance = Infinity;
              
              sections.forEach((sectionId) => {
                const element = document.getElementById(`modal-section-${sectionId}`);
                if (element) {
                  const elementTop = element.offsetTop;
                  const elementBottom = elementTop + element.offsetHeight;
                  const elementMiddle = elementTop + (elementBottom - elementTop) / 2;
                  
                  // Calcula a distância do meio do elemento ao meio da viewport
                  const distance = Math.abs(viewportMiddle - elementMiddle);
                  
                  // Se o elemento está visível na viewport e mais próximo do centro
                  if (elementTop <= scrollTop + container.clientHeight && 
                      elementBottom >= scrollTop && 
                      distance < minDistance) {
                    minDistance = distance;
                    activeId = sectionId;
                  }
                }
              });
              
              setActiveSection(activeId);
            }}
            >
              {/* Overview Section */}
              <div id="modal-section-overview" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
                {/* Address */}
                {selectedProject.address && selectedProject.address.trim() && (
                  <div style={{ marginBottom: 12, textAlign: 'left' }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, fontWeight: 600 }}>Address</div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, textAlign: 'left' }}>{selectedProject.address}</div>
                  </div>
                )}

              {/* Datas */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8, fontWeight: 600, textAlign: 'left' }}>Datas</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Beams</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{selectedProject.previous_beams_date ? formatDate(selectedProject.previous_beams_date) : 'N/A'}</div>
                  </div>
                  <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Start</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{selectedProject.previous_start_date ? formatDate(selectedProject.previous_start_date) : 'N/A'}</div>
                  </div>
                  <div style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>End</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{selectedProject.previous_end_date ? formatDate(selectedProject.previous_end_date) : 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Observations */}
              {selectedProject.obs && selectedProject.obs.trim() && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4, fontWeight: 600, textAlign: 'left' }}>Observations</div>
                  <div style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.5, background: 'var(--color-background-secondary)', padding: '12px', borderRadius: 8 }}>
                    {selectedProject.obs}
                  </div>
                </div>
              )}

              {/* Linha separadora */}
              {selectedProject.fieldwire && selectedProject.fieldwire.length > 0 && (
                <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
              )}

              {/* Fieldwire Documents */}
              {selectedProject.fieldwire && selectedProject.fieldwire.length > 0 && (
                <div id="modal-section-fieldwire" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, textAlign: 'left' }}>Fieldwire Documents</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedProject.fieldwire.map((fw) => (
                      <div key={fw.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.05)',
                        borderRadius: 8,
                        border: '1px solid var(--color-border-divider)'
                      }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                          {fw.document || 'N/A'}
                        </div>
                        {fw.status ? (
                          <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80' }} />
                        ) : (
                          <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linha separadora */}
              {selectedProject.buildertrend === true && (
                <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
              )}

              {/* Machines and Attachments */}
              {selectedProject.machines && selectedProject.machines.length > 0 && (
                <div id="modal-section-machines" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'left' }}>Machines and Attachments</div>
                  {selectedProject.machine_provider && (
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, opacity: 0.7, textAlign: 'left' }}>
                      Provided by {selectedProject.machine_provider}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedProject.machines.map((m) => {
                      const isBoomlift = m.title?.toLowerCase().includes('boomlift');
                      const isForklift = m.title?.toLowerCase().includes('forklift');
                      return (
                        <div key={m.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px',
                          background: 'rgba(0,0,0,0.05)',
                          borderRadius: 8,
                          border: '1px solid var(--color-border-divider)'
                        }}>
                          {/* Imagem no início */}
                          {(isBoomlift || isForklift) && (
                            <img 
                              src={isBoomlift ? iconBoomlift : iconForklift} 
                              alt={isBoomlift ? 'Boomlift' : 'Forklift'} 
                              style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} 
                            />
                          )}
                          {/* Informações alinhadas à esquerda */}
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                              {m.title || 'N/A'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', opacity: 0.5, marginBottom: m.status && m.unit ? 4 : 0 }}>
                              {m.equipment_category || ''}
                            </div>
                            {m.status && m.unit && (
                              <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                                Unit: {m.unit}
                              </div>
                            )}
                          </div>
                          {/* Status alinhado à direita */}
                          {m.status ? (
                            <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
                          ) : (
                            <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Linha separadora */}
              {(selectedProject.fieldwire && selectedProject.fieldwire.length > 0) && (
                <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
              )}

              {/* Buildertrend - Sempre presente */}
              <div id="modal-section-buildertrend" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12, textAlign: 'left' }}>BuilderTrend</div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  background: 'rgba(0,0,0,0.05)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-divider)'
                }}>
                  <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>Criação da obra dentro BuilderTrend</div>
                  {selectedProject.buildertrend ? (
                    <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80', flexShrink: 0 }} />
                  ) : (
                    <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24', flexShrink: 0 }} />
                  )}
                </div>
              </div>

              {/* Linha separadora */}
              <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />

              {/* Linha separadora */}
              {selectedProject.contract_steps && selectedProject.contract_steps.length > 0 && (
                <div style={{ height: 1, background: 'var(--color-border-divider)', marginBottom: 16 }} />
              )}

              {/* Contract Steps */}
              {selectedProject.contract_steps && selectedProject.contract_steps.length > 0 && (
                <div id="modal-section-contract" style={{ marginBottom: 16, scrollMarginTop: '20px' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, textAlign: 'left' }}>Contract Steps</div>
                  {selectedProject.workforce && (
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, opacity: 0.7, textAlign: 'left' }}>
                      Workforce: {selectedProject.workforce}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedProject.contract_steps.map((cs) => (
                      <div key={cs.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.05)',
                        borderRadius: 8,
                        border: '1px solid var(--color-border-divider)'
                      }}>
                        <div style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                          {cs.step || 'N/A'}
                        </div>
                        {cs.status ? (
                          <i className="bi bi-check-circle" style={{ fontSize: 20, color: '#4ade80' }} />
                        ) : (
                          <i className="bi bi-x-circle" style={{ fontSize: 20, color: '#fbbf24' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


