import React from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';

interface ForecastFiltersProps {
  selectedYear: string;
  selectedMonth: string;
  selectedClient: string[];
  selectedJobSite: string[];
  selectedType: string;
  years: string[];
  months: string[];
  clients: string[];
  jobSites: string[];
  availableTypes: string[];
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onClientChange: (clients: string[]) => void;
  onJobSiteChange: (jobSites: string[]) => void;
  onTypeChange: (type: string) => void;
}

export default function ForecastFilters({
  selectedYear,
  selectedMonth,
  selectedClient,
  selectedJobSite,
  selectedType,
  years,
  months,
  clients,
  jobSites,
  availableTypes,
  onYearChange,
  onMonthChange,
  onClientChange,
  onJobSiteChange,
  onTypeChange
}: ForecastFiltersProps) {
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
      
      {/* Filtro de tempo (Ano/Mês) */}
      <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
          <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
        </span>
        <select 
          id="year-select" 
          name="year" 
          value={selectedYear} 
          onChange={e => onYearChange(e.target.value)} 
          style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 70, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
        >
          <option value="">All</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select 
          id="month-select" 
          name="month" 
          value={selectedMonth} 
          onChange={e => onMonthChange(e.target.value)} 
          style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}
        >
          <option value="">All</option>
          {months.map(m => <option key={m} value={m}>{String(months.indexOf(m) + 1).padStart(2, '0')}</option>)}
        </select>
      </div>

      {/* Cliente */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-building" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={clients.map(client => ({ value: client, label: client }))}
            selectedValues={selectedClient}
            onChange={onClientChange}
            placeholder="Client"
            allLabel="All"
            dropdownTitle="Client"
          />
        </div>
      </div>

      {/* Job Site */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 19, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-geo-alt" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 20, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={jobSites.map(jobSite => ({ value: jobSite, label: jobSite }))}
            selectedValues={selectedJobSite}
            onChange={onJobSiteChange}
            placeholder="Job Site"
            allLabel="All"
            dropdownTitle="Job Site"
          />
        </div>
      </div>

      {/* Type Filter */}
      <div className="input-group" style={{ minWidth: 140, maxWidth: 140, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 18, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-tags" style={{ fontSize: 17 }} />
        </span>
        <select 
          value={selectedType} 
          onChange={e => onTypeChange(e.target.value)} 
          style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 92, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', borderTopRightRadius: 8, borderBottomRightRadius: 8 }}
        >
          <option value="all">All Types</option>
          {availableTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>
    </div>
  );
}