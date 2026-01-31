import React, { useState } from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';
import iconQBTime from '../../../assets/qbtime_logo.png';

interface MobileForecastFiltersProps {
  selectedYear: string;
  selectedMonth: string;
  selectedClient: string[];
  selectedJobSite: string[];
  selectedType: string;
  selectedFieldwire: string;
  selectedBuildertrend: string;
  selectedMachines: string;
  selectedContractSteps: string;
  selectedWorkforce: string;
  selectedQBTime: string;
  filterNotStarted: boolean;
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
  onFieldwireChange: (value: string) => void;
  onBuildertrendChange: (value: string) => void;
  onMachinesChange: (value: string) => void;
  onContractStepsChange: (value: string) => void;
  onWorkforceChange: (value: string) => void;
  onFilterNotStartedChange: (value: boolean) => void;
}

export default function MobileForecastFilters({
  selectedYear,
  selectedMonth,
  selectedClient,
  selectedJobSite,
  selectedType,
  selectedFieldwire,
  selectedBuildertrend,
  selectedMachines,
  selectedContractSteps,
  selectedWorkforce,
  selectedQBTime,
  filterNotStarted,
  years,
  months,
  clients,
  jobSites,
  availableTypes,
  onYearChange,
  onMonthChange,
  onClientChange,
  onJobSiteChange,
  onTypeChange,
  onFieldwireChange,
  onBuildertrendChange,
  onMachinesChange,
  onContractStepsChange,
  onWorkforceChange,
  onQBTimeChange,
  onFilterNotStartedChange
}: MobileForecastFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Estilo para selects customizados
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    width: '100%',
    transition: 'background 0.3s, color 0.3s, border 0.3s',
    cursor: 'pointer',
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

  // Estilo para botões segmentados
  const segmentedButtonGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    background: 'var(--color-background-primary)',
    padding: '4px',
    borderRadius: 8,
    border: '1px solid var(--color-border-divider)'
  };

  const segmentedButtonStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-background-secondary)' : 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
  });

  const activeFiltersCount = [
    selectedYear,
    selectedMonth,
    ...selectedClient,
    ...selectedJobSite,
    selectedType !== 'all' ? selectedType : null,
    selectedFieldwire !== 'all' ? selectedFieldwire : null,
    selectedBuildertrend !== 'all' ? selectedBuildertrend : null,
    selectedMachines !== 'all' ? selectedMachines : null,
    selectedContractSteps !== 'all' ? selectedContractSteps : null,
    selectedWorkforce !== 'all' ? selectedWorkforce : null,
    selectedQBTime !== 'all' ? selectedQBTime : null,
    filterNotStarted ? 'not-started' : null,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    onYearChange('');
    onMonthChange('');
    onClientChange([]);
    onJobSiteChange([]);
    onTypeChange('all');
    onFieldwireChange('all');
    onBuildertrendChange('all');
    onMachinesChange('all');
    onContractStepsChange('all');
    onWorkforceChange('all');
    onQBTimeChange('all');
    onFilterNotStartedChange(true);
  };

  // Componente para botões segmentados
  const SegmentedButtonGroup = ({ 
    value, 
    onChange, 
    icon, 
    label 
  }: { 
    value: string; 
    onChange: (value: string) => void; 
    icon?: React.ReactNode;
    label: string;
  }) => (
    <div>
      <label style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--color-text-secondary)',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        {icon}
        {label}
      </label>
      <div style={segmentedButtonGroupStyle}>
        <button
          style={segmentedButtonStyle(value === 'all')}
          onClick={() => onChange('all')}
        >
          All
        </button>
        <button
          style={segmentedButtonStyle(value === 'yes')}
          onClick={() => onChange('yes')}
        >
          Completed
        </button>
        <button
          style={segmentedButtonStyle(value === 'no')}
          onClick={() => onChange('no')}
        >
          Not Completed
        </button>
      </div>
    </div>
  );

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
          gap: '20px',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}>
          {/* Seção: Filtros Básicos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px'
            }}>
              Basic Filters
            </div>
            
            {/* Filtro de Status Not Started - Container destacado */}
            <div style={{
              background: filterNotStarted ? 'rgba(108, 117, 125, 0.1)' : 'var(--color-background-primary)',
              border: `2px solid ${filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '8px',
              transition: 'all 0.3s'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 500,
                color: filterNotStarted ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-hourglass-split" style={{ 
                    color: filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                    fontSize: '16px'
                  }} />
                  <span style={{ fontWeight: filterNotStarted ? 600 : 500 }}>
                    Show only "Not Started"
                  </span>
                </div>
                <label style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: '44px',
                  height: '24px',
                  margin: 0,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={filterNotStarted}
                    onChange={(e) => onFilterNotStartedChange(e.target.checked)}
                    style={{
                      opacity: 0,
                      width: 0,
                      height: 0
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-border-divider)',
                    transition: '0.3s',
                    borderRadius: '24px'
                  }}>
                    <span style={{
                      position: 'absolute',
                      height: '18px',
                      width: '18px',
                      left: '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      transition: '0.3s',
                      borderRadius: '50%',
                      transform: filterNotStarted ? 'translateX(20px)' : 'translateX(0)'
                    }} />
                  </span>
                </label>
              </div>
            </div>
            
            {/* Filtro de tempo */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                marginBottom: '6px'
              }}>
                <i className="bi bi-calendar-range me-2" style={{ color: 'var(--color-accent-primary)' }} />
                Period
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                marginBottom: '6px'
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
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                marginBottom: '6px'
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

            {/* Filtro de Tipo */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                marginBottom: '6px'
              }}>
                <i className="bi bi-tags me-2" style={{ color: 'var(--color-accent-primary)' }} />
                Type
              </label>
              <select 
                value={selectedType} 
                onChange={e => onTypeChange(e.target.value)} 
                style={selectStyle}
              >
                <option value="all">All Types</option>
                {availableTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>

          {/* Divisor */}
          <div style={{
            height: '1px',
            background: 'var(--color-border-divider)',
            margin: '4px 0'
          }} />

          {/* Seção: Filtros de Conclusão */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px'
            }}>
              Completion Status
            </div>

            {/* FieldWire */}
            <SegmentedButtonGroup
              value={selectedFieldwire}
              onChange={onFieldwireChange}
              icon={
                <img 
                  src={iconFieldwire} 
                  alt="FieldWire" 
                  style={{ width: 16, height: 16, objectFit: 'contain' }}
                />
              }
              label="FieldWire"
            />

            {/* BuilderTrend */}
            <SegmentedButtonGroup
              value={selectedBuildertrend}
              onChange={onBuildertrendChange}
              icon={
                <img 
                  src={iconBuildertrend} 
                  alt="BuilderTrend" 
                  style={{ width: 16, height: 16, objectFit: 'contain' }}
                />
              }
              label="BuilderTrend"
            />

            {/* Machines and Attachments */}
            <SegmentedButtonGroup
              value={selectedMachines}
              onChange={onMachinesChange}
              icon={
                <i className="bi bi-truck" style={{ fontSize: 14, color: 'var(--color-accent-primary)' }} />
              }
              label="Machines"
            />

            {/* Contract Steps */}
            <SegmentedButtonGroup
              value={selectedContractSteps}
              onChange={onContractStepsChange}
              icon={
                <i className="bi bi-file-earmark-check" style={{ fontSize: 14, color: 'var(--color-accent-primary)' }} />
              }
              label="Contract Steps"
            />

            {/* Workforce */}
            <SegmentedButtonGroup
              value={selectedWorkforce}
              onChange={onWorkforceChange}
              icon={
                <i className="bi bi-people" style={{ fontSize: 14, color: 'var(--color-accent-primary)' }} />
              }
              label="Workforce"
            />

            {/* Quickbooks Time */}
            <SegmentedButtonGroup
              value={selectedQBTime}
              onChange={onQBTimeChange}
              icon={
                <img 
                  src={iconQBTime} 
                  alt="Quickbooks Time" 
                  style={{ width: 16, height: 16, objectFit: 'contain' }}
                />
              }
              label="Quickbooks Time"
            />
          </div>

          {/* Botão para limpar filtros */}
          {activeFiltersCount > 0 && (
            <button
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border-divider)',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.3s',
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={clearAllFilters}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-background-primary)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
                e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
                e.currentTarget.style.borderColor = 'var(--color-border-divider)';
              }}
            >
              <i className="bi bi-x-circle" />
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
