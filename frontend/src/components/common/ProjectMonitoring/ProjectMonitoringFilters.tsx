import React, { useState } from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import { addCurrentMonthIfMissing } from '../../../utils/dataUtils';
import type { ProjectMonitoringHvacData } from '../../../hooks/useProjectMonitoringHvacData';

interface ProjectMonitoringFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedProject: string[];
  setSelectedProject: (projects: string[]) => void;
  selectedTeam: string[];
  setSelectedTeam: (teams: string[]) => void;
  selectedStatus: string[];
  setSelectedStatus: (status: string[]) => void;
  years: string[];
  months: string[];
  projects: string[];
  teams: string[];
  projectMonitoringData: ProjectMonitoringHvacData[];
  dropdownWidth?: number;
  cityJobsiteDropdownWidth?: number;
  teamDropdownWidth?: number;
}

export default function ProjectMonitoringFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedProject,
  setSelectedProject,
  selectedTeam,
  setSelectedTeam,
  selectedStatus,
  setSelectedStatus,
  years,
  months,
  projects,
  teams,
  projectMonitoringData,
  dropdownWidth,
  cityJobsiteDropdownWidth,
  teamDropdownWidth
}: ProjectMonitoringFiltersProps) {
  const [dateType, setDateType] = useState<'start' | 'finish'>('start');
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  // Estilo para selects customizados
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 14,
    transition: 'background 0.3s, color 0.3s, border 0.3s',
  };

  return (
    <div className="d-flex flex-row align-items-center" style={{ gap: 10, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-funnel" />
        Filters
      </span>
      
      {/* Ano e Mês */}
      <div className="input-group" style={{ minWidth: 197, maxWidth: 197, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
          <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
        </span>
        <select id="year-select" name="year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {(years || []).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {addCurrentMonthIfMissing(months || [], selectedYear).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Controle de Data Type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Date Type</span>
        <button 
          onClick={() => setDateType('start')} 
          style={{ 
            background: dateType === 'start' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: dateType === 'start' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)', 
            border: dateType === 'start' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)', 
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
            if (dateType !== 'start') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
              e.currentTarget.style.color = 'var(--color-brand-blue)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = dateType === 'start' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = dateType === 'start' ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = dateType === 'start' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
          }}
        >
          Start
        </button>
        <button 
          onClick={() => setDateType('finish')} 
          style={{ 
            background: dateType === 'finish' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: dateType === 'finish' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)', 
            border: dateType === 'finish' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)', 
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
            if (dateType !== 'finish') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
              e.currentTarget.style.color = 'var(--color-brand-blue)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = dateType === 'finish' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = dateType === 'finish' ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = dateType === 'finish' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
          }}
        >
          Finish
        </button>
      </div>

      {/* Filtro de Status com Ícones */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38, position: 'relative' }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Status</span>
        
        {/* Completed - Verde */}
        <button 
          onClick={() => {
            const newStatus = selectedStatus.includes('completed') 
              ? selectedStatus.filter(s => s !== 'completed')
              : [...selectedStatus, 'completed'];
            setSelectedStatus(newStatus);
          }}
          onMouseEnter={() => setShowTooltip('completed')}
          onMouseLeave={() => setShowTooltip(null)}
          style={{ 
            background: selectedStatus.includes('completed') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedStatus.includes('completed') ? '#28a745' : 'var(--color-text-primary)', 
            border: selectedStatus.includes('completed') ? '1.5px solid #28a745' : '1.5px solid var(--color-border-divider)', 
            borderRadius: 15, 
            padding: '4px 8px', 
            fontWeight: 500, 
            fontSize: 14, 
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            height: 26,
            width: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 26,
            position: 'relative'
          }}
        >
          <i className="bi bi-check-circle-fill" style={{ fontSize: 14, color: selectedStatus.includes('completed') ? '#28a745' : '#28a745' }} />
        </button>

        {/* In Progress - Amarelo/Laranja */}
        <button 
          onClick={() => {
            const newStatus = selectedStatus.includes('in_progress') 
              ? selectedStatus.filter(s => s !== 'in_progress')
              : [...selectedStatus, 'in_progress'];
            setSelectedStatus(newStatus);
          }}
          onMouseEnter={() => setShowTooltip('in_progress')}
          onMouseLeave={() => setShowTooltip(null)}
          style={{ 
            background: selectedStatus.includes('in_progress') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedStatus.includes('in_progress') ? '#ffc107' : 'var(--color-text-primary)', 
            border: selectedStatus.includes('in_progress') ? '1.5px solid #ffc107' : '1.5px solid var(--color-border-divider)', 
            borderRadius: 15, 
            padding: '4px 8px', 
            fontWeight: 500, 
            fontSize: 14, 
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            height: 26,
            width: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 26,
            position: 'relative'
          }}
        >
          <i className="bi bi-clock-fill" style={{ fontSize: 14, color: selectedStatus.includes('in_progress') ? '#ffc107' : '#ffc107' }} />
        </button>

        {/* No Started - Vermelho */}
        <button 
          onClick={() => {
            const newStatus = selectedStatus.includes('no_started') 
              ? selectedStatus.filter(s => s !== 'no_started')
              : [...selectedStatus, 'no_started'];
            setSelectedStatus(newStatus);
          }}
          onMouseEnter={() => setShowTooltip('no_started')}
          onMouseLeave={() => setShowTooltip(null)}
          style={{ 
            background: selectedStatus.includes('no_started') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedStatus.includes('no_started') ? '#dc3545' : 'var(--color-text-primary)', 
            border: selectedStatus.includes('no_started') ? '1.5px solid #dc3545' : '1.5px solid var(--color-border-divider)', 
            borderRadius: 15, 
            padding: '4px 8px', 
            fontWeight: 500, 
            fontSize: 14, 
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            height: 26,
            width: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 26,
            position: 'relative'
          }}
        >
          <i className="bi bi-pause-circle-fill" style={{ fontSize: 14, color: selectedStatus.includes('no_started') ? '#dc3545' : '#dc3545' }} />
        </button>

        {/* Tooltip Personalizado */}
        {showTooltip && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-background-primary)',
            border: '1px solid var(--color-border-divider)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            marginTop: 4
          }}>
            {showTooltip === 'completed' && 'Completed - Todos os stages concluídos'}
            {showTooltip === 'in_progress' && 'In Progress - Projeto em andamento'}
            {showTooltip === 'no_started' && 'No Started - Projeto não iniciado'}
          </div>
        )}
      </div>

      {/* Cidade • Jobsite */}
      <div className="input-group" style={{ minWidth: dropdownWidth || 180, maxWidth: dropdownWidth || 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 18, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-geo-alt" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 19, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={(projects || []).map(project => {
              // Buscar a cidade correspondente ao jobsite
              const projectData = projectMonitoringData?.find(d => d.job_site === project);
              const city = projectData?.city || '';
              return { 
                value: project, 
                label: city ? `${city} • ${project}` : project 
              };
            })}
            selectedValues={selectedProject}
            onChange={setSelectedProject}
            placeholder="Cidade • Jobsite"
            allLabel="Todos"
            dropdownTitle="Cidade • Jobsite"
            dropdownWidth={cityJobsiteDropdownWidth}
          />
        </div>
      </div>

      {/* Team */}
      <div className="input-group" style={{ minWidth: dropdownWidth || 180, maxWidth: dropdownWidth || 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 16, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-people" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 17, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={(teams || []).map(team => ({ value: team, label: team }))}
            selectedValues={selectedTeam}
            onChange={setSelectedTeam}
            placeholder="Team"
            allLabel="Todos"
            dropdownTitle="Team"
            dropdownWidth={teamDropdownWidth}
          />
        </div>
      </div>
    </div>
  );
}
