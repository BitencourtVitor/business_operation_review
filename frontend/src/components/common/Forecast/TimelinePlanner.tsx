import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateShort } from '../../../utils/formatters';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconFieldwire from '../../../assets/fieldwire.png';

const POSITIVE_STRINGS = ['yes', 'sim', 'true', '1', 'y'];

const isTruthyFlag = (value?: string | boolean | null): boolean => {
  if (typeof value === 'boolean') return value;
  if (!value) return false;
  const normalized = value.toString().toLowerCase().trim();
  if (!normalized) return false;
  return POSITIVE_STRINGS.includes(normalized);
};

// Status a partir da coluna status; atraso independente
const getProjectStatus = (project: WorkforceProject): 'not-started' | 'open' => {
  const normalizedStatus = (project.status || '').toLowerCase().trim();
  if (normalizedStatus === 'open') return 'open';
  return 'not-started';
};

// Tipo de atraso: 'start' quando não iniciou após a data de início
// IMPORTANTE: O atraso é determinado APENAS pela StartDate, não pela BeamsDate
// REGRA: Se a obra está iniciada (status ≠ "Not Started"), ela NÃO pode estar atrasada
// Só pode estar atrasada se status = "Not Started" E StartDate foi ultrapassada
const getOverdueType = (project: WorkforceProject): 'start' | null => {
  const normalizedStatus = (project.status || '').toLowerCase().trim();
  
  // Se o status for diferente de "Not Started", a obra já começou, então NÃO está atrasada
  if (normalizedStatus !== 'not started') {
    return null;
  }
  
  // Se o status for "Not Started", verificar se a StartDate foi ultrapassada
  // BeamsDate NÃO é usado para determinar atraso
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = project.previous_start_date ? new Date(project.previous_start_date) : null;
  if (startDate) {
    startDate.setHours(0, 0, 0, 0);
    if (today > startDate) return 'start';
  }
  
  return null;
};

// Cores para status e atraso
const PROJECT_STATUS_COLORS = {
  'not-started': {
    primary: '#6c757d',
    hover: '#5a6268'
  },
  'open': {
    primary: '#28a745',
    hover: '#218838'
  }
} as const;
const OVERDUE_COLORS = { primary: '#e04b4b', hover: '#c73f3f' } as const;
const INDICATOR_ICON_STYLE: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

type DateMode = 'start' | 'beams';

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
  previous_beams_date: string | null;
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
  dateMode: DateMode;
  onDateModeChange: (mode: DateMode) => void;
}

export default function TimelinePlanner({ 
  workforceProjects,
  selectedYear, 
  selectedMonth, 
  groupBy, 
  onGroupByChange,
  sortByDate,
  onSortByDateChange,
  dateMode,
  onDateModeChange
}: TimelinePlannerProps) {
  const getShortJobSite = (value?: string) => {
    if (!value) return '';
    const idx = value.indexOf(',');
    return (idx === -1 ? value : value.slice(0, idx)).trim();
  };
  const resolveReferenceDate = (project: WorkforceProject) => {
    const ref = dateMode === 'beams'
      ? (project.previous_beams_date || project.previous_start_date)
      : project.previous_start_date;
    return ref || '';
  };
  const dateModeLabel = dateMode === 'beams' ? 'Beams Date' : 'Start Date';
  const navigate = useNavigate();
  const [draggedProject, setDraggedProject] = useState<WorkforceProject | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const [timelineDragStart, setTimelineDragStart] = useState({ x: 0, scrollLeft: 0 });
  const [jobTooltip, setJobTooltip] = useState<{ visible: boolean; x: number; y: number; content: string; align: 'left' | 'right' }>({ visible: false, x: 0, y: 0, content: '', align: 'right' });
  const [statusTooltip, setStatusTooltip] = useState<{ visible: boolean; x: number; y: number; content: string; align: 'left' | 'right' }>({ visible: false, x: 0, y: 0, content: '', align: 'right' });
  
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
          width: 144 // +20% largura para dias
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
          const referenceDate = resolveReferenceDate(project);
          if (referenceDate) {
            const projectDate = new Date(referenceDate);
            if (!isNaN(projectDate.getTime())) {
              monthsWithData.add(projectDate.getMonth() + 1);
            }
          }
        });
        
        // Retornar apenas meses com dados
        return Array.from(monthsWithData)
          .sort((a, b) => a - b)
          .map(monthIndex => ({
            label: months[monthIndex - 1].substring(0, 3),
            fullLabel: months[monthIndex - 1],
            month: monthIndex,
            width: 240 // +20% largura para meses
          }));
      } else {
        // Se há filtro de ano, mostrar todos os meses do ano
        return months.map((month, index) => ({
          label: month.substring(0, 3),
          fullLabel: month,
          month: index + 1,
          width: 240 // +20% largura para meses
        }));
      }
    }
  }, [showDays, selectedYear, selectedMonth, workforceProjects, dateMode]);

  // Agrupar dados conforme seleção
  const groupedData = useMemo(() => {
    const groups: { [key: string]: WorkforceProject[] } = {};
    
    // Considerar apenas projetos com datas válidas de início e fim
    const validProjects = workforceProjects.filter(p => {
      if (!p.previous_start_date || !p.previous_end_date) return false;
      const s = new Date(p.previous_start_date);
      const e = new Date(p.previous_end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
      const referenceDate = resolveReferenceDate(p);
      if (!referenceDate) return false;
      const refDateObj = new Date(referenceDate);
      return !isNaN(refDateObj.getTime());
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
        const dateA = new Date(resolveReferenceDate(a) || '1900-01-01');
        const dateB = new Date(resolveReferenceDate(b) || '1900-01-01');
        return dateA.getTime() - dateB.getTime();
      })
    })).sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [workforceProjects, groupBy, dateMode]);

  // Calcular altura total de projetos para cada grupo
  const getCardHeight = (project: WorkforceProject) => {
    const hasObservation = !!(project.observacoes && project.observacoes.trim());
    const hasHvac = !!(project.hvac && project.hvac.toUpperCase() === 'YES');
    const hasFieldwire = isTruthyFlag(project.fieldwire);
    const hasContract = isTruthyFlag(project.tem_contrato);
    const hasTeam = !!(project.workforce && project.workforce.trim());
    const hasDates = !!(project.previous_start_date && project.previous_end_date);
    const hasBeamsDate = !!(project.previous_beams_date && project.previous_beams_date.trim?.() !== '');
    const indicatorCount = [hasHvac, hasFieldwire].filter(Boolean).length;

    let height = 144; // header + job + lot
    if (hasTeam) height += 16;
    if (hasDates) height += 16;
    if (hasBeamsDate) height += 16;
    if (indicatorCount > 0) height += indicatorCount * 18; // espaço para indicadores
    if (hasObservation) height += 36;
    return height;
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
      const referenceDate = resolveReferenceDate(project);
      if (!referenceDate) return false;
      
      if (showDays) {
        return timeColumn.date ? referenceDate.startsWith(timeColumn.date) : false;
      } else {
        // Parse date string directly to avoid timezone issues
        const dateParts = referenceDate.split('-');
        if (dateParts.length !== 3) return false;
        
        const projectYear = parseInt(dateParts[0], 10);
        const projectMonth = parseInt(dateParts[1], 10);
        
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
        const dateA = new Date(resolveReferenceDate(a) || '1900-01-01');
        const dateB = new Date(resolveReferenceDate(b) || '1900-01-01');
        
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

  // Tooltip personalizado para Job Site (mostra endereço completo)
  const handleJobSiteMouseEnter = (e: React.MouseEvent, project: WorkforceProject) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const tooltipWidth = 320;
    const padding = 12;
    const preferRight = rect.right + tooltipWidth + padding < window.innerWidth;
    const x = preferRight ? rect.right + padding : rect.left - tooltipWidth - padding;
    const y = Math.max(8, rect.top + window.scrollY - 6);
    const content = (project.address && project.address.trim()) ? project.address : project.job_site;
    setJobTooltip({ visible: true, x, y, content, align: preferRight ? 'right' : 'left' });
  };

  const handleJobSiteMouseLeave = () => {
    setJobTooltip(prev => ({ ...prev, visible: false }));
  };

  // Tooltip para Status
  const handleStatusMouseEnter = (e: React.MouseEvent, label: string) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const tooltipWidth = 200;
    const padding = 12;
    const preferRight = rect.right + tooltipWidth + padding < window.innerWidth;
    const x = preferRight ? rect.right + padding : rect.left - tooltipWidth - padding;
    const y = Math.max(8, rect.top + window.scrollY - 6);
    setStatusTooltip({ visible: true, x, y, content: label, align: preferRight ? 'right' : 'left' });
  };

  const handleStatusMouseLeave = () => {
    setStatusTooltip(prev => ({ ...prev, visible: false }));
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
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 12px', border: '1px solid var(--color-border-divider)', height: 38 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Date Mode</span>
                <button
                  onClick={() => onDateModeChange('start')}
                  style={{
                    background: dateMode === 'start' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
                    color: dateMode === 'start' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
                    border: dateMode === 'start' ? '1.5px solid var(--color-accent-primary)' : '1.5px solid var(--color-border-divider)',
                    borderRadius: 15,
                    padding: '4px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 26
                  }}
                >
                  Start
                </button>
                <button
                  onClick={() => onDateModeChange('beams')}
                  style={{
                    background: dateMode === 'beams' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
                    color: dateMode === 'beams' ? '#17a2b8' : 'var(--color-text-primary)',
                    border: dateMode === 'beams' ? '1.5px solid #17a2b8' : '1.5px solid var(--color-border-divider)',
                    borderRadius: 15,
                    padding: '4px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 26
                  }}
                >
                  Beams
                </button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by {dateModeLabel}</span>
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
                                const overdueType = getOverdueType(project);
                                const overdue = !!overdueType;
                                // Três condições mutuamente exclusivas:
                                // 1. Vermelho: status = "Not Started" E StartDate ultrapassada (atrasada)
                                // 2. Verde: status ≠ "Not Started" (iniciada)
                                // 3. Cinza: status = "Not Started" E StartDate não ultrapassada (normal)
                                const cardColors = overdue ? OVERDUE_COLORS : (projectStatus === 'open' ? PROJECT_STATUS_COLORS.open : PROJECT_STATUS_COLORS['not-started']);
                                const hasHvac = !!(project.hvac && project.hvac.toUpperCase() === 'YES');
                                const hasFieldwire = isTruthyFlag(project.fieldwire);
                                const hasContract = isTruthyFlag(project.tem_contrato);
                                const indicatorBadges = ([
                                  hasHvac && (
                                    <div key={`${project.id}-hvac`} style={INDICATOR_ICON_STYLE}>
                                      <img 
                                        src={iconForecastHvac} 
                                        alt="HVAC" 
                                        style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.95 }} 
                                      />
                                    </div>
                                  ),
                                  hasFieldwire && (
                                    <div key={`${project.id}-fieldwire`} style={INDICATOR_ICON_STYLE} title="Fieldwire">
                                      <img 
                                        src={iconFieldwire} 
                                        alt="Fieldwire" 
                                        style={{ width: 18, height: 18, objectFit: 'contain' }} 
                                      />
                                    </div>
                                  )
                                ] as (false | JSX.Element)[]).filter(Boolean) as JSX.Element[];
                                
                                return (
                                <div
                                  key={project.id}
                                  draggable
                                style={{
                                  background: cardColors.primary,
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  marginBottom: projectIndex < projects.length - 1 ? 10 : 0,
                                  color: 'white',
                                  fontSize: 12,
                                  cursor: 'grab',
                                  transition: 'all 0.2s ease',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  userSelect: 'none',
                                  height: 'auto',
                                  flexShrink: 0,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'stretch',
                                  textAlign: 'left',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                }}
                                  onDragStart={(e) => handleDragStart(e, project)}
                                  onDragEnd={handleDragEnd}
                                  onMouseEnter={(e) => {
                                    if (!draggedProject) {
                                      e.currentTarget.style.background = cardColors.hover;
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                      e.currentTarget.style.cursor = 'grab';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!draggedProject) {
                                      e.currentTarget.style.background = cardColors.primary;
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }
                                  }}
                                >
                                {/* Layout em duas colunas: esquerda (info) e direita (status + HVAC) */}
                                <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                  {/* Coluna esquerda - informações */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Título */}
                                    <div style={{ color: 'white', fontWeight: 700, marginTop: 2, marginBottom: 2, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {project.cliente}
                                    </div>
                                    {/* Job site com tooltip de endereço completo e quebra de linha */}
                                    <div 
                                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
                                      onMouseEnter={(e) => handleJobSiteMouseEnter(e, project)}
                                      onMouseLeave={handleJobSiteMouseLeave}
                                    >
                                      <i className="bi bi-geo-alt" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word' }}>{getShortJobSite(project.job_site)}</span>
                                    </div>
                                    {/* Lote com ícone */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.9, marginTop: 4, marginBottom: 4, fontWeight: 'bold' }}>
                                      <i className="bi bi-building" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                      <span>{project.type || 'Lot'} {project.lote_building}</span>
                                    </div>
                                    {/* Equipe com ícone */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {hasContract && (
                                        <i className="bi bi-file-earmark-check" style={{ 
                                          fontSize: 14, 
                                          color: '#20c997' 
                                        }} />
                                      )}
                                      <i className="bi bi-people" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                      <span style={{ 
                                        fontSize: 11, 
                                        opacity: 0.8,
                                        marginBottom: 4,
                                        fontWeight: project.workforce ? 'normal' : 'bold',
                                        color: project.workforce ? 'inherit' : '#ffcc00'
                                      }}>
                                        {project.workforce || 'No team assigned'}
                                      </span>
                                    </div>
                                    {/* Datas */}
                                    {project.previous_beams_date && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <i className="bi bi-flag" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                        <span style={{ fontSize: 11, opacity: 0.9 }}>
                                          Beams: {formatDateShort(project.previous_beams_date)}
                                        </span>
                                      </div>
                                    )}
                                    {project.previous_start_date && project.previous_end_date && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <i className="bi bi-calendar-range" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                        <span style={{ fontSize: 11, opacity: 0.9 }}>
                                          {formatDateShort(project.previous_start_date)} - {formatDateShort(project.previous_end_date)}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Coluna direita - status e HVAC (itens alinhados à direita) */}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, width: 52, flexShrink: 0 }}>
                                    <div 
                                      onMouseEnter={(e) => handleStatusMouseEnter(e, overdue ? 'Overdue' : (projectStatus === 'open' ? 'Started' : 'Not Started'))}
                                      onMouseLeave={handleStatusMouseLeave}
                                      style={{
                                      background: 'rgba(255,255,255,0.2)',
                                      color: 'white',
                                      borderRadius: 12,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: 32,
                                      height: 32
                                    }}>
                                      {overdue ? (
                                        <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14 }} />
                                      ) : projectStatus === 'open' ? (
                                        <i className="bi bi-play-fill" style={{ fontSize: 16 }} />
                                      ) : (
                                        <span style={{ fontSize: 11 }}>N/S</span>
                                      )}
                                    </div>
                                    {indicatorBadges.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'row', gap: 6 }}>
                                        {indicatorBadges}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {/* Observação em largura total, fora das duas colunas */}
                                {project.observacoes && project.observacoes.trim() && (
                                  <div style={{
                                    marginTop: 8,
                                    padding: '6px 8px',
                                    background: 'rgba(0,0,0,0.15)',
                                    borderRadius: 6,
                                    color: 'rgba(255,255,255,0.95)',
                                    fontSize: 11,
                                    lineHeight: 1.3
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
      {/* Tooltip de Job Site (endereço completo) */}
      {jobTooltip.visible && (
        <div
          style={{
            position: 'fixed',
            top: jobTooltip.y,
            left: jobTooltip.x,
            zIndex: 2000,
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: 8,
            padding: '10px 12px',
            width: 320,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            transition: 'opacity 0.5s ease',
            opacity: 1
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-geo" style={{ color: 'var(--color-accent-primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Full Address</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.35 }}>
            {jobTooltip.content}
          </div>
        </div>
      )}
      {/* Tooltip de Status */}
      {statusTooltip.visible && (
        <div
          style={{
            position: 'fixed',
            top: statusTooltip.y,
            left: statusTooltip.x,
            zIndex: 2000,
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: 8,
            padding: '8px 10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            transition: 'opacity 0.5s ease',
            opacity: 1,
            fontSize: 13,
            whiteSpace: 'nowrap'
          }}
        >
          {statusTooltip.content}
        </div>
      )}
    </div>
  );
}
