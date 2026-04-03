import React from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import { addCurrentMonthIfMissing } from '../../../utils/dataUtils';

interface PermitFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedModel: string[];
  setSelectedModel: (models: string[]) => void;
  selectedSituation: string[];
  setSelectedSituation: (situations: string[]) => void;
  selectedJobsite: string[];
  setSelectedJobsite: (jobsites: string[]) => void;
  years: string[];
  months: string[];
  models: string[];
  jobsites: string[];
}

export default function PermitFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedModel,
  setSelectedModel,
  selectedSituation,
  setSelectedSituation,
  selectedJobsite,
  setSelectedJobsite,
  years,
  months,
  models,
  jobsites,
}: PermitFiltersProps) {
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
      <div className="input-group" style={{ minWidth: 197, maxWidth: 197, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
          <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
        </span>
        <select id="year-select" name="year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {addCurrentMonthIfMissing(months, selectedYear).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {/* Situation - Controle similar ao Type do Accounting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Situation</span>
        <button 
          onClick={() => setSelectedSituation([])} 
          style={{ 
            background: selectedSituation.length === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedSituation.length === 0 ? 'var(--color-brand-blue)' : 'var(--color-text-primary)', 
            border: selectedSituation.length === 0 ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedSituation.length !== 0) {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
              e.currentTarget.style.color = 'var(--color-brand-blue)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedSituation.length === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedSituation.length === 0 ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedSituation.length === 0 ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
          }}
        >
          All
        </button>
        <button 
          onClick={() => setSelectedSituation(['Not Applied'])} 
          style={{ 
            background: selectedSituation.includes('Not Applied') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedSituation.includes('Not Applied') ? 'var(--negative-color)' : 'var(--color-text-primary)', 
            border: selectedSituation.includes('Not Applied') ? '1.5px solid var(--negative-color)' : '1.5px solid var(--color-border-divider)', 
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
            if (!selectedSituation.includes('Not Applied')) {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--negative-color)';
              e.currentTarget.style.color = 'var(--negative-color)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedSituation.includes('Not Applied') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedSituation.includes('Not Applied') ? 'var(--negative-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedSituation.includes('Not Applied') ? 'var(--negative-color)' : 'var(--color-text-primary)';
          }}
        >
          Not Applied
        </button>
        <button 
          onClick={() => setSelectedSituation(['Applied'])} 
          style={{ 
            background: selectedSituation.includes('Applied') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedSituation.includes('Applied') ? 'var(--challenges-color)' : 'var(--color-text-primary)', 
            border: selectedSituation.includes('Applied') ? '1.5px solid var(--challenges-color)' : '1.5px solid var(--color-border-divider)', 
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
            if (!selectedSituation.includes('Applied')) {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--challenges-color)';
              e.currentTarget.style.color = 'var(--challenges-color)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedSituation.includes('Applied') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedSituation.includes('Applied') ? 'var(--challenges-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedSituation.includes('Applied') ? 'var(--challenges-color)' : 'var(--color-text-primary)';
          }}
        >
          Applied
        </button>
        <button 
          onClick={() => setSelectedSituation(['Issued'])} 
          style={{ 
            background: selectedSituation.includes('Issued') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedSituation.includes('Issued') ? 'var(--positive-color)' : 'var(--color-text-primary)', 
            border: selectedSituation.includes('Issued') ? '1.5px solid var(--positive-color)' : '1.5px solid var(--color-border-divider)', 
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
            if (!selectedSituation.includes('Issued')) {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--positive-color)';
              e.currentTarget.style.color = 'var(--positive-color)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedSituation.includes('Issued') ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedSituation.includes('Issued') ? 'var(--positive-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedSituation.includes('Issued') ? 'var(--positive-color)' : 'var(--color-text-primary)';
          }}
        >
          Issued
        </button>
      </div>
      {/* Model */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-box" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={models.map(model => ({ value: model, label: model }))}
            selectedValues={selectedModel}
            onChange={setSelectedModel}
            placeholder="Model"
            allLabel="Todos"
            dropdownTitle="Model"
          />
        </div>
      </div>
      {/* Jobsite */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 18, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-geo-alt" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 19, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={jobsites.map(jobsite => ({ value: jobsite, label: jobsite }))}
            selectedValues={selectedJobsite}
            onChange={setSelectedJobsite}
            placeholder="Jobsite"
            allLabel="Todos"
            dropdownTitle="Jobsite"
          />
        </div>
      </div>
    </div>
  );
} 