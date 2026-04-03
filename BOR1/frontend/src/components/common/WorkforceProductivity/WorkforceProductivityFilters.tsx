import React from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import { addCurrentMonthIfMissing } from '../../../utils/dataUtils';

interface WorkforceProductivityFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedClients: string[];
  setSelectedClients: (clients: string[]) => void;
  selectedJobsites: string[];
  setSelectedJobsites: (jobsites: string[]) => void;
  selectedWorktypes: string[];
  setSelectedWorktypes: (worktypes: string[]) => void;
  years: string[];
  months: string[];
  clients: string[];
  jobsites: string[];
  worktypes: string[];
}

export default function WorkforceProductivityFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedClients,
  setSelectedClients,
  selectedJobsites,
  setSelectedJobsites,
  selectedWorktypes,
  setSelectedWorktypes,
  years,
  months,
  clients,
  jobsites,
  worktypes
}: WorkforceProductivityFiltersProps) {
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

  // Ordenar clientes: Callahan, Pulte Homes, Toll Brothers, Particular no topo, o resto abaixo
  const sortedClients = React.useMemo(() => {
    const priorityClients = ['Callahan', 'Pulte Homes', 'Toll Brothers', 'Particular'];
    
    const top = clients.filter(c => priorityClients.includes(c)).sort((a, b) => {
      return priorityClients.indexOf(a) - priorityClients.indexOf(b);
    });
    
    const others = clients.filter(c => !priorityClients.includes(c)).sort((a, b) => a.localeCompare(b));
    
    return [...top, ...others];
  }, [clients]);

  return (
    <div className="d-flex flex-row align-items-center" style={{ gap: 10, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-funnel" />
        Filters
      </span>
      
      {/* Year/Month */}
      <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
          <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
        </span>
        <select id="year-select" name="year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 70, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {addCurrentMonthIfMissing(months, selectedYear).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Clients */}
      <div className="input-group" style={{ minWidth: 200, maxWidth: 200, background: 'var(--color-background-primary)', borderRadius: 8, height: 38, zIndex: 20, display: 'flex', border: '1.5px solid var(--color-border-divider)', overflow: 'hidden' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)' }}>
          <i className="bi bi-person-badge" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, height: 38, border: 'none' }}>
          <MultiSelectDropdown 
            options={sortedClients.map(client => ({ value: client, label: client }))}
            selectedValues={selectedClients}
            onChange={setSelectedClients}
            allLabel="Todos"
            dropdownTitle="Clients / Others"
          />
        </div>
      </div>

      {/* Jobsites and Lot */}
      <div className="input-group" style={{ minWidth: 224, maxWidth: 224, background: 'var(--color-background-primary)', borderRadius: 8, height: 38, zIndex: 19, display: 'flex', border: '1.5px solid var(--color-border-divider)', overflow: 'hidden' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)' }}>
          <i className="bi bi-geo-alt" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 20, height: 38, border: 'none' }}>
          <MultiSelectDropdown 
            options={jobsites.map(jobsite => ({ value: jobsite, label: jobsite }))}
            selectedValues={selectedJobsites}
            onChange={setSelectedJobsites}
            allLabel="Todos"
            dropdownTitle="Jobsite and Lot"
            dropdownWidth={400}
          />
        </div>
      </div>

      {/* Worktypes */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, height: 38, zIndex: 18, display: 'flex', border: '1.5px solid var(--color-border-divider)', overflow: 'hidden' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)' }}>
          <i className="bi bi-tools" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 19, height: 38, border: 'none' }}>
          <MultiSelectDropdown 
            options={worktypes.map(wt => ({ value: wt, label: wt }))}
            selectedValues={selectedWorktypes}
            onChange={setSelectedWorktypes}
            allLabel="Todos"
            dropdownTitle="Worktypes"
          />
        </div>
      </div>
    </div>
  );
}
