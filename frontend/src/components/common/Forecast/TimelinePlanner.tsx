import React, { useState, useMemo, useRef } from 'react';
import { formatDateShort } from '../../../utils/formatters';
import iconForecastHvac from '../../../assets/icon_forecast_hvac.png';
import iconForecastHvacDark from '../../../assets/icon_forecast_hvac_darkmode.png';
import iconFieldwire from '../../../assets/fieldwire.png';
import type { WorkforceProject, ForecastData } from './types';
import { 
  hasCompleteContract, 
  getReferenceDate, 
  getOverdueType,
  hasActiveFieldwire,
  getProjectTeams
} from './helpers';

// Importar novos componentes
import ForecastProjectsGrid from './ForecastProjectsGrid';
import ForecastProjectModal from './ForecastProjectModal';

// Status a partir da coluna status; atraso independente
const getProjectStatus = (project: WorkforceProject): 'open' | 'started' | 'closed' => {
  const status = (project.status || '').toLowerCase().trim();
  if (status === 'closed') return 'closed';
  if (status === 'open' || status === 'started') return 'started';
  return 'open';
};

// Cores para status e atraso
const PROJECT_STATUS_COLORS = {
  'open': {
    primary: '#6c757d',
    hover: '#5a6268'
  },
  'started': {
    primary: '#28a745',
    hover: '#218838'
  },
  'closed': {
    primary: '#495057',
    hover: '#343a40'
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

interface TimelinePlannerProps {
  theme?: 'light' | 'dark';
  forecastData: ForecastData[];
  workforceProjects: WorkforceProject[];
  selectedYear: string;
  selectedMonth: string;
  groupBy: 'cliente' | 'job_site';
  sortByDate: 'off' | 'asc' | 'desc' | null;
  dateMode: DateMode;
  viewMode: 'grid' | 'timeline';
}

export default function TimelinePlanner({ 
  theme,
  workforceProjects,
  selectedYear, 
  selectedMonth, 
  groupBy, 
  sortByDate,
  dateMode,
  viewMode
}: TimelinePlannerProps) {
  const getShortJobSite = (value?: string) => {
    if (!value) return '';
    const idx = value.indexOf(',');
    return (idx === -1 ? value : value.slice(0, idx)).trim();
  };
    const isDarkMode = theme ? theme === 'dark' : document.documentElement.classList.contains('dark');
    const hvacIcon = isDarkMode ? iconForecastHvacDark : iconForecastHvac;
  
  // Novos estados para o redesign
  const [selectedProject, setSelectedProject] = useState<WorkforceProject | null>(null);

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
          const referenceDate = getReferenceDate(project, dateMode);
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

  // Agrupar dados conforme seleção (apenas para a Timeline View)
  const groupedData = useMemo(() => {
    const groups: { [key: string]: WorkforceProject[] } = {};
    
    // Na visualização de Timeline, ainda precisamos de datas válidas para plotar
    const validProjects = workforceProjects.filter(p => {
      const hasDates = p.previous_start_date && p.previous_end_date;
      if (!hasDates) return false;
      
      const s = new Date(p.previous_start_date!);
      const e = new Date(p.previous_end_date!);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
      
      const referenceDate = getReferenceDate(p, dateMode);
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
        const dateA = new Date(getReferenceDate(a, dateMode) || '1900-01-01');
        const dateB = new Date(getReferenceDate(b, dateMode) || '1900-01-01');
        return dateA.getTime() - dateB.getTime();
      })
    })).sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [workforceProjects, groupBy, dateMode]);

  // Novo agrupamento para o Grid View (Inspirado no Mobile)
  const groupedByMonth = useMemo(() => {
    const grouped: { [key: string]: WorkforceProject[] } = {};
    
    workforceProjects.forEach(project => {
      const referenceDate = getReferenceDate(project, dateMode);
      
      let monthYear = 'Pending / No Date';
      
      if (referenceDate) {
        const dateParts = referenceDate.split('-');
        if (dateParts.length === 3) {
          const projectYear = dateParts[0];
          const projectMonthNum = parseInt(dateParts[1], 10);
          const projectMonthName = new Date(2024, projectMonthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
          monthYear = `${projectMonthName} / ${projectYear}`;
        }
      }
      
      if (!grouped[monthYear]) {
        grouped[monthYear] = [];
      }
      grouped[monthYear].push(project);
    });

    // Ordenar projetos dentro de cada mês
    Object.keys(grouped).forEach(month => {
      grouped[month].sort((a, b) => {
        const dateA = new Date(getReferenceDate(a, dateMode) || '1900-01-01').getTime();
        const dateB = new Date(getReferenceDate(b, dateMode) || '1900-01-01').getTime();
        if (sortByDate === 'desc') return dateB - dateA;
        return dateA - dateB;
      });
    });

    // Ordenar os meses cronologicamente, colocando "Pending / No Date" no final
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'Pending / No Date') return 1;
      if (b === 'Pending / No Date') return -1;
      
      const [monthA, yearA] = a.split(' / ');
      const [monthB, yearB] = b.split(' / ');
      const dateA = new Date(`${monthA} 1, ${yearA}`);
      const dateB = new Date(`${monthB} 1, ${yearB}`);
      
      if (sortByDate === 'desc') {
        return dateB.getTime() - dateA.getTime();
      }
      return dateA.getTime() - dateB.getTime();
    });
  }, [workforceProjects, dateMode, sortByDate]);

  // Calcular altura total de projetos para cada grupo
  const getCardHeight = (project: WorkforceProject) => {
    const hasObservation = !!(project.obs && project.obs.trim());
    const hasBeams = !!project.previous_beams_date;
    const hasDates = !!(project.previous_start_date && project.previous_end_date);
    
    const hasHvac = !!project.hvac;
    const hasFw = hasActiveFieldwire(project);
    const indicatorCount = [hasHvac, hasFw].filter(Boolean).length;

    // Altura da coluna esquerda (informações)
    let leftHeight = 20; // Título
    leftHeight += 20; // Job Site (estimado com wrap)
    leftHeight += 18; // Lote
    leftHeight += 18; // Equipe
    if (hasBeams) leftHeight += 18;
    if (hasDates) leftHeight += 18;
    leftHeight += 12; // Paddings internos

    // Altura da coluna direita (status + indicadores)
    let rightHeight = 28; // Status
    rightHeight += indicatorCount * 40; // Indicadores (32px + 8px gap)
    rightHeight += 12; // Paddings internos

    let height = Math.max(leftHeight, rightHeight);
    if (hasObservation) height += 50; // Altura estimada para observação
    
    return height + 20; // + padding total do card
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
      const referenceDate = getReferenceDate(project, dateMode);
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
        const dateA = new Date(getReferenceDate(a, dateMode) || '1900-01-01');
        const dateB = new Date(getReferenceDate(b, dateMode) || '1900-01-01');
        
        if (sortByDate === 'asc') {
          return dateA.getTime() - dateB.getTime();
        } else {
          return dateB.getTime() - dateA.getTime();
        }
      });
    }

    return filteredProjects;
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
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Modal de Detalhes do Projeto */}
      {selectedProject && (
        <ForecastProjectModal
          theme={theme}
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}

      <div className="card" style={{ background: 'var(--color-background-primary)', border: 'none', height: '100%', display: 'flex', flexDirection: 'column', margin: 0, padding: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {viewMode === 'grid' ? (
            <div style={{ animation: 'fadeIn 0.4s ease-out', padding: 0 }}>
              <ForecastProjectsGrid
                theme={theme}
                groupedProjects={groupedByMonth}
                onProjectClick={setSelectedProject}
              />
            </div>
          ) : (
            <div className="card-body p-0" style={{ border: '1px solid var(--color-border-divider)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', overflow: 'hidden', height: '100%', padding: 0 }}>
          {groupedData.length === 0 ? (
            <div className="text-center p-4" style={{ color: 'var(--color-text-secondary)' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
              <p className="mb-0">No projects found for the selected filters</p>
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
                            >
                              {projects.map((project, projectIndex) => {
                                const projectStatus = getProjectStatus(project);
                                const overdueType = getOverdueType(project);
                                const overdue = !!overdueType;
                                // Três condições mutuamente exclusivas:
                                // 1. Vermelho: status = "Open" E StartDate ultrapassada (atrasada)
                                // 2. Verde: status ≠ "Open" (iniciada)
                                // 3. Cinza: status = "Open" E StartDate não ultrapassada (normal)
                                const cardColors = overdue ? OVERDUE_COLORS : (projectStatus === 'started' ? PROJECT_STATUS_COLORS.started : projectStatus === 'closed' ? PROJECT_STATUS_COLORS.closed : PROJECT_STATUS_COLORS.open);
                                
                                const hasHvac = !!project.hvac;
                                const hasFw = hasActiveFieldwire(project);
                                const hasContract = hasCompleteContract(project);
                                
                                const indicatorBadges = ([
                                  hasHvac && (
                                    <div key={`${project.id}-hvac`} style={INDICATOR_ICON_STYLE} title="HVAC">
                                      <img 
                                        src={hvacIcon} 
                                        alt="HVAC" 
                                        style={{ width: 18, height: 18, objectFit: 'contain', opacity: 0.95 }} 
                                      />
                                    </div>
                                  ),
                                  hasFw && (
                                    <div key={`${project.id}-fieldwire`} style={INDICATOR_ICON_STYLE} title="Fieldwire">
                                      <img 
                                        src={iconFieldwire} 
                                        alt="Fieldwire" 
                                        style={{ width: 18, height: 18, objectFit: 'contain' }} 
                                      />
                                    </div>
                                  )
                                ] as (false | React.ReactElement)[]).filter(Boolean) as React.ReactElement[];
                                
                                return (
                                <div
                                  key={project.id}
                                style={{
                                  background: cardColors.primary,
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  marginBottom: projectIndex < projects.length - 1 ? 10 : 0,
                                  color: 'white',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  userSelect: 'none',
                                  height: 'auto',
                                  flexShrink: 0,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'stretch',
                                  textAlign: 'left',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProject(project);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.2)';
                                  e.currentTarget.style.background = cardColors.hover;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                  e.currentTarget.style.background = cardColors.primary;
                                }}
                                >
                                  {/* Layout em duas colunas: esquerda (info) e direita (status + indicators) */}
                                  <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                    {/* Coluna esquerda - informações */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {/* Título */}
                                      <div style={{ color: 'white', fontWeight: 700, marginTop: 2, marginBottom: 2, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {project.cliente}
                                      </div>
                                      
                                      {/* Job site */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <i className="bi bi-geo-alt" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                          {getShortJobSite(project.job_site)}
                                        </span>
                                      </div>
                                      
                                      {/* Lote */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.9, marginTop: 4, fontWeight: 'bold' }}>
                                        <i className="bi bi-building" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                        <span>{project.type || 'Lot'} {project.lote_bld || 'N/A'}</span>
                                      </div>
                                      
                                      {/* Equipe */}
                                      {(() => {
                                        const teams = getProjectTeams(project);
                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <i className="bi bi-people" style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }} />
                                            <span style={{ 
                                                fontSize: 11, 
                                                opacity: 0.9,
                                                color: teams.length > 0 ? 'inherit' : '#ffcc00',
                                                fontWeight: teams.length > 0 ? 'normal' : 'bold'
                                              }}>
                                                {(() => {
                                                  if (teams.length === 0) return 'No team';
                                                  if (teams.length === 1) return teams[0];
                                                  return `${teams.length} teams involved`;
                                                })()}
                                              </span>
                                            {hasContract && (
                                              <i className="bi bi-file-earmark-check" style={{ color: '#4ade80', fontSize: 14 }} title="Contract Complete" />
                                            )}
                                          </div>
                                        );
                                      })()}
                                      
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
                                    
                                    {/* Coluna direita - status e indicators */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, width: 40, flexShrink: 0 }}>
                                      <div style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        color: 'white',
                                        borderRadius: 8,
                                        width: 28,
                                        height: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}>
                                        {overdue ? (
                                          <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 14 }} />
                                        ) : projectStatus === 'open' ? (
                                          <i className="bi bi-play-fill" style={{ fontSize: 16 }} />
                                        ) : (
                                          <span style={{ fontSize: 10, fontWeight: 700 }}>N/S</span>
                                        )}
                                      </div>
                                      {indicatorBadges}
                                    </div>
                                  </div>
                                  
                                  {/* Observação */}
                                  {project.obs && project.obs.trim() && (
                                    <div style={{
                                      marginTop: 8,
                                      padding: '6px 8px',
                                      background: 'rgba(0,0,0,0.15)',
                                      borderRadius: 6,
                                      color: 'rgba(255,255,255,0.95)',
                                      fontSize: 11,
                                      lineHeight: 1.3
                                    }}>
                                      {project.obs}
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
          )}
        </div>
    </div>
  </div>
  );
}