import React from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import { addCurrentMonthIfMissing } from '../../../utils/dataUtils';

interface ServiceFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedContractor: string[];
  setSelectedContractor: (contractors: string[]) => void;
  selectedJobsite: string[];
  setSelectedJobsite: (jobsites: string[]) => void;
  selectedCity: string[];
  setSelectedCity: (cities: string[]) => void;
  selectedIssue: string[];
  setSelectedIssue: (issues: string[]) => void;
  selectedWarranty: 'all' | 'warranty' | 'non-warranty';
  setSelectedWarranty: (warranty: 'all' | 'warranty' | 'non-warranty') => void;
  years: string[];
  months: string[];
  contractors: string[];
  jobsites: string[];
  cities: string[];
  issues: string[];
}

export default function ServiceFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedContractor,
  setSelectedContractor,
  selectedJobsite,
  setSelectedJobsite,
  selectedCity,
  setSelectedCity,
  selectedIssue,
  setSelectedIssue,
  selectedWarranty,
  setSelectedWarranty,
  years,
  months,
  contractors,
  jobsites,
  cities,
  issues,
}: ServiceFiltersProps) {
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
          <option value="Todos">Todos</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="Todos">Todos</option>
          {addCurrentMonthIfMissing(months, selectedYear).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {/* Contractor */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 24, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-person-badge" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 25, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={contractors.map(contractor => ({ value: contractor, label: contractor }))}
            selectedValues={selectedContractor}
            onChange={setSelectedContractor}
            placeholder="Contractor"
            allLabel="Todos"
            dropdownTitle="Contractor"
          />
        </div>
      </div>
      {/* Jobsite */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 22, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-geo-alt" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 23, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={jobsites.map(jobsite => ({ value: jobsite, label: jobsite }))}
            selectedValues={selectedJobsite}
            onChange={setSelectedJobsite}
            placeholder="Job Site"
            allLabel="Todos"
            dropdownTitle="Job Site"
            dropdownWidth={200}
          />
        </div>
      </div>
      {/* City */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-building" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={cities.map(city => ({ value: city, label: city }))}
            selectedValues={selectedCity}
            onChange={setSelectedCity}
            placeholder="City"
            allLabel="Todos"
            dropdownTitle="City"
          />
        </div>
      </div>
      {/* Issue */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 18, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-exclamation-triangle" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 19, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={issues.map(issue => ({ value: issue, label: issue }))}
            selectedValues={selectedIssue}
            onChange={setSelectedIssue}
            placeholder="Issue"
            allLabel="Todos"
            dropdownTitle="Issue"
            dropdownWidth={200}
          />
        </div>
      </div>
      {/* Warranty */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Warranty</span>
        <button 
          onClick={() => setSelectedWarranty('all')} 
          style={{ 
            background: selectedWarranty === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedWarranty === 'all' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)', 
            border: selectedWarranty === 'all' ? '1.5px solid var(--color-accent-primary)' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedWarranty !== 'all') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              e.currentTarget.style.color = 'var(--color-accent-primary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedWarranty === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedWarranty === 'all' ? 'var(--color-accent-primary)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedWarranty === 'all' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)';
          }}
        >
          All
        </button>
        <button 
          onClick={() => setSelectedWarranty('warranty')} 
          style={{ 
            background: selectedWarranty === 'warranty' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedWarranty === 'warranty' ? '#fd7e14' : 'var(--color-text-primary)', 
            border: selectedWarranty === 'warranty' ? '1.5px solid #fd7e14' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedWarranty !== 'warranty') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = '#fd7e14';
              e.currentTarget.style.color = '#fd7e14';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedWarranty === 'warranty' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedWarranty === 'warranty' ? '#fd7e14' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedWarranty === 'warranty' ? '#fd7e14' : 'var(--color-text-primary)';
          }}
        >
          Yes
        </button>
        <button 
          onClick={() => setSelectedWarranty('non-warranty')} 
          style={{ 
            background: selectedWarranty === 'non-warranty' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedWarranty === 'non-warranty' ? '#28a745' : 'var(--color-text-primary)', 
            border: selectedWarranty === 'non-warranty' ? '1.5px solid #28a745' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedWarranty !== 'non-warranty') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = '#28a745';
              e.currentTarget.style.color = '#28a745';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedWarranty === 'non-warranty' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedWarranty === 'non-warranty' ? '#28a745' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedWarranty === 'non-warranty' ? '#28a745' : 'var(--color-text-primary)';
          }}
        >
          No
        </button>
      </div>
    </div>
  );
}
