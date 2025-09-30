import React, { useState } from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';

interface MobileForecastFiltersProps {
  selectedYear: string;
  selectedMonth: string;
  selectedClient: string[];
  selectedJobSite: string[];
  years: string[];
  months: string[];
  clients: string[];
  jobSites: string[];
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onClientChange: (clients: string[]) => void;
  onJobSiteChange: (jobSites: string[]) => void;
}

export default function MobileForecastFilters({
  selectedYear,
  selectedMonth,
  selectedClient,
  selectedJobSite,
  years,
  months,
  clients,
  jobSites,
  onYearChange,
  onMonthChange,
  onClientChange,
  onJobSiteChange
}: MobileForecastFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Estilo para selects customizados
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 16,
    width: '100%',
    transition: 'background 0.3s, color 0.3s, border 0.3s',
  };

  const filterButtonStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '12px 16px',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.3s',
    boxSizing: 'border-box'
  };

  const activeFiltersCount = [
    selectedYear,
    selectedMonth,
    ...selectedClient,
    ...selectedJobSite
  ].filter(Boolean).length;

  return (
    <div style={{ 
      marginBottom: '15px',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Botão de toggle dos filtros */}
      <button
        style={filterButtonStyle}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-background-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--color-background-secondary)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-funnel" style={{ color: 'var(--color-accent-primary)' }} />
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <span style={{
              background: 'var(--color-accent-primary)',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold'
            }}>
              {activeFiltersCount}
            </span>
          )}
        </div>
        <i 
          className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} 
          style={{ color: 'var(--color-text-secondary)' }}
        />
      </button>

      {/* Filtros expandidos */}
      {isExpanded && (
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          padding: '15px',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}>
          {/* Filtro de tempo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '8px'
            }}>
              <i className="bi bi-calendar-range me-2" style={{ color: 'var(--color-accent-primary)' }} />
              Period
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                value={selectedYear} 
                onChange={e => onYearChange(e.target.value)} 
                style={selectStyle}
              >
                <option value="">All years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select 
                value={selectedMonth} 
                onChange={e => onMonthChange(e.target.value)} 
                style={selectStyle}
              >
                <option value="">All months</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Filtro de Cliente */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '8px'
            }}>
              <i className="bi bi-building me-2" style={{ color: 'var(--color-accent-primary)' }} />
              Client
            </label>
            <MultiSelectDropdown 
              options={clients.map(client => ({ value: client, label: client }))}
              selectedValues={selectedClient}
              onChange={onClientChange}
              placeholder="Select clients"
              allLabel="All"
              dropdownTitle="Clients"
            />
          </div>

          {/* Filtro de Job Site */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '8px'
            }}>
              <i className="bi bi-geo-alt me-2" style={{ color: 'var(--color-accent-primary)' }} />
              Work Location
            </label>
            <MultiSelectDropdown 
              options={jobSites.map(jobSite => ({ value: jobSite, label: jobSite }))}
              selectedValues={selectedJobSite}
              onChange={onJobSiteChange}
              placeholder="Select locations"
              allLabel="All"
              dropdownTitle="Work Locations"
            />
          </div>

          {/* Botão para limpar filtros */}
          {activeFiltersCount > 0 && (
            <button
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.3s',
                alignSelf: 'flex-start'
              }}
              onClick={() => {
                onYearChange('');
                onMonthChange('');
                onClientChange([]);
                onJobSiteChange([]);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-background-primary)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              <i className="bi bi-x-circle me-2" />
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
