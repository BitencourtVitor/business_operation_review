import React, { useState, useEffect } from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import SingleSelectDropdown from '../SingleSelectDropdown';
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
  onQBTimeChange: (value: string) => void;
  onFilterNotStartedChange: (value: boolean) => void;
  dateMode: 'start' | 'beams';
  onDateModeChange: (mode: 'start' | 'beams') => void;
  sortByDate: 'off' | 'asc' | 'desc' | null;
  onSortByDateChange: (sortBy: 'off' | 'asc' | 'desc' | null) => void;
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
  onFilterNotStartedChange,
  dateMode,
  onDateModeChange,
  sortByDate,
  onSortByDateChange
}: MobileForecastFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Estilo para selects customizados
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 13,
    width: '100%',
    transition: 'background 0.3s, color 0.3s, border 0.3s',
    cursor: 'pointer',
  };

  const filterButtonStyle: React.CSSProperties = {
    background: 'var(--color-background-secondary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 8,
    padding: '6px 10px',
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.3s',
    boxSizing: 'border-box'
  };

  // Estilo para botões segmentados
  const segmentedButtonGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: '2px',
    background: 'rgba(var(--color-text-primary-rgb, 0, 0, 0), 0.05)',
    padding: '2px',
    borderRadius: 8,
    border: '1px solid var(--color-border-divider)'
  };

  const segmentedButtonStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#fff' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-accent-primary)' : 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    boxShadow: isActive ? '0 2px 4px rgba(0, 0, 0, 0.2)' : 'none'
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
    <div style={{
      ...filterButtonStyle,
      height: '42px',
      padding: '0 4px 0 15px',
      cursor: 'default',
      background: 'var(--color-background-primary)',
      border: '1px solid var(--color-border-divider)',
      borderRadius: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'var(--color-accent-primary)', display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>{label}</span>
      </div>
      <div style={{ ...segmentedButtonGroupStyle, border: 'none', background: 'rgba(var(--color-text-primary-rgb), 0.08)' }}>
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
          Done
        </button>
        <button
          style={segmentedButtonStyle(value === 'no')}
          onClick={() => onChange('no')}
        >
          Pendent
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ 
      marginBottom: '0',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Container Consolidado: Filtros, Date Mode, Sort */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '8px',
        width: '100%',
        marginBottom: 0
      }}>
        {/* Filtros Toggle */}
        <div style={{ flex: isMobile ? 'none' : 1.5, display: 'flex', flexDirection: 'column' }}>
          <button
            style={{
              ...filterButtonStyle,
              height: '42px',
              background: isExpanded 
                ? 'rgba(var(--color-accent-primary-rgb, 37, 99, 235), 0.05)' 
                : 'var(--color-background-secondary)',
              color: isExpanded ? 'var(--color-accent-primary)' : 'var(--color-text-primary)',
              border: `1px solid ${isExpanded ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
              borderRadius: '8px',
              justifyContent: 'space-between',
              padding: '0 15px',
              boxShadow: 'none',
              transform: 'none'
            }}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className={`bi bi-funnel${activeFiltersCount > 0 ? '-fill' : ''}`} style={{ 
                color: isExpanded || activeFiltersCount > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                fontSize: '16px'
              }} />
              <span style={{ fontWeight: isExpanded ? 700 : 600 }}>Filters</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {activeFiltersCount > 0 && (
                <span style={{
                  background: 'var(--color-accent-primary)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  minWidth: '18px',
                  height: '18px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  border: isExpanded ? '1.5px solid #fff' : 'none'
                }}>
                  {activeFiltersCount}
                </span>
              )}
              <i 
                className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} 
                style={{ color: isExpanded ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', fontSize: '12px' }}
              />
            </div>
          </button>
        </div>

        {/* Date Mode Control */}
        <div style={{ flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            ...filterButtonStyle,
            height: '42px',
            padding: '0 4px 0 15px',
            cursor: 'default',
            background: 'var(--color-background-secondary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-calendar-event" style={{ color: 'var(--color-accent-primary)' }} />
              <span style={{ fontWeight: 600, fontSize: '13px' }}>Date Mode</span>
            </div>
            <div style={{ ...segmentedButtonGroupStyle, border: 'none', background: 'rgba(var(--color-text-primary-rgb), 0.08)' }}>
              <button
                onClick={() => onDateModeChange('start')}
                style={segmentedButtonStyle(dateMode === 'start')}
              >
                Start
              </button>
              <button
                onClick={() => onDateModeChange('beams')}
                style={segmentedButtonStyle(dateMode === 'beams')}
              >
                Beams
              </button>
            </div>
          </div>
        </div>

        {/* Sort Control */}
        <div style={{ flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            ...filterButtonStyle,
            height: '42px',
            padding: '0 4px 0 15px',
            cursor: 'default',
            background: 'var(--color-background-secondary)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-sort-down" style={{ color: 'var(--color-accent-primary)' }} />
              <span style={{ fontWeight: 600, fontSize: '13px' }}>Sort Order</span>
            </div>
            <div style={{ ...segmentedButtonGroupStyle, border: 'none', background: 'rgba(var(--color-text-primary-rgb), 0.08)' }}>
              <button
                onClick={() => onSortByDateChange('asc')}
                style={segmentedButtonStyle(sortByDate === 'asc')}
              >
                ASC
              </button>
              <button
                onClick={() => onSortByDateChange('desc')}
                style={segmentedButtonStyle(sortByDate === 'desc')}
              >
                DESC
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros expandidos */}
      <div style={{
        maxHeight: isExpanded ? (isMobile ? 'none' : '80vh') : '0',
        opacity: isExpanded ? 1 : 0,
        marginTop: isExpanded ? '12px' : '0',
        overflow: isExpanded ? (isMobile ? 'visible' : 'auto') : 'hidden',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'var(--color-background-secondary)',
        border: isExpanded ? '1px solid var(--color-border-divider)' : 'none',
        borderRadius: '12px',
        boxShadow: isExpanded ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : 'none',
        zIndex: 10,
        pointerEvents: isExpanded ? 'auto' : 'none',
        visibility: isExpanded ? 'visible' : 'hidden'
      }}>
        <div style={{
          padding: isExpanded ? '16px' : '0',
          display: isExpanded ? 'flex' : 'none',
          flexDirection: 'column',
          gap: '16px',
          width: '100%'
        }}>
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? '20px' : '32px',
              width: '100%'
            }}>
              {/* Coluna 1: Filtros Básicos */}
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px' 
              }}>
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
                  background: filterNotStarted ? 'rgba(var(--color-accent-primary-rgb, 37, 99, 235), 0.05)' : 'var(--color-background-primary)',
                  border: `1px solid ${filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
                  borderRadius: '12px',
                  padding: '10px 14px',
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
                      width: '40px',
                      height: '22px',
                      margin: 0,
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={filterNotStarted}
                        onChange={(e) => onFilterNotStartedChange(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-border-divider)',
                        transition: '0.3s',
                        borderRadius: '24px'
                      }}>
                        <span style={{
                          position: 'absolute',
                          height: '16px', width: '16px',
                          left: '3px', bottom: '3px',
                          backgroundColor: 'white',
                          transition: '0.3s',
                          borderRadius: '50%',
                          transform: filterNotStarted ? 'translateX(18px)' : 'translateX(0)'
                        }} />
                      </span>
                    </label>
                  </div>
                </div>
                
                <div style={{
                  ...filterButtonStyle,
                  height: isMobile ? 'auto' : '42px',
                  padding: isMobile ? '8px 4px 8px 15px' : '0 4px 0 15px',
                  cursor: 'default',
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? '4px' : '8px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    flexShrink: 0,
                    padding: isMobile ? '4px 0' : 0
                  }}>
                    <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: '14px' }} />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Period</span>
                  </div>
                  
                  <div style={{ 
                    display: 'flex',
                    flex: 1,
                    height: isMobile ? 'auto' : '100%',
                    alignItems: 'center',
                    gap: '4px',
                    justifyContent: 'flex-end',
                    paddingRight: '2px'
                  }}>
                    <div style={{ 
                      flex: 1,
                      height: isMobile ? '34px' : '30px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '6px',
                      background: 'rgba(var(--color-text-primary-rgb), 0.03)',
                      transition: 'all 0.2s'
                    }}>
                      <SingleSelectDropdown 
                        options={years.map(y => ({ value: y, label: y }))}
                        selectedValue={selectedYear}
                        onChange={onYearChange}
                        placeholder="Year"
                        allLabel="All"
                        dropdownTitle="Years"
                        variant="ghost"
                        label="Year"
                      />
                    </div>
                    
                    <div style={{ 
                      flex: 1,
                      height: isMobile ? '34px' : '30px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '6px',
                      background: 'rgba(var(--color-text-primary-rgb), 0.03)',
                      transition: 'all 0.2s'
                    }}>
                      <SingleSelectDropdown 
                        options={months.map(m => ({ value: m, label: m }))}
                        selectedValue={selectedMonth}
                        onChange={onMonthChange}
                        placeholder="Month"
                        allLabel="All"
                        dropdownTitle="Months"
                        variant="ghost"
                        label="Month"
                      />
                    </div>
                  </div>
                </div>

                {/* Filtros de Cliente e Work Location agrupados */}
                <div style={{
                  ...filterButtonStyle,
                  height: isMobile ? 'auto' : '42px',
                  padding: isMobile ? '8px 4px 8px 15px' : '0 4px 0 15px',
                  cursor: 'default',
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? '4px' : '8px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    flexShrink: 0,
                    padding: isMobile ? '4px 0' : 0
                  }}>
                    <i className="bi bi-geo-alt" style={{ color: 'var(--color-accent-primary)', fontSize: '14px' }} />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Project</span>
                  </div>

                  <div style={{ 
                    display: 'flex',
                    flex: 1,
                    height: isMobile ? 'auto' : '100%',
                    alignItems: 'center',
                    gap: '4px',
                    justifyContent: 'flex-end',
                    paddingRight: '2px'
                  }}>
                    <div style={{ 
                      flex: 1,
                      height: isMobile ? '34px' : '30px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 0,
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '6px',
                      background: 'rgba(var(--color-text-primary-rgb), 0.03)',
                      transition: 'all 0.2s'
                    }}>
                      <MultiSelectDropdown 
                        options={clients.map(client => ({ value: client, label: client }))}
                        selectedValues={selectedClient}
                        onChange={onClientChange}
                        placeholder="Client"
                        allLabel="All"
                        dropdownTitle="Clients"
                        variant="ghost"
                        label="Client"
                      />
                    </div>

                    <div style={{ 
                      flex: 1.2,
                      height: isMobile ? '34px' : '30px', 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 0,
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: '6px',
                      background: 'rgba(var(--color-text-primary-rgb), 0.03)',
                      transition: 'all 0.2s'
                    }}>
                      <MultiSelectDropdown 
                        options={jobSites.map(jobSite => ({ value: jobSite, label: jobSite }))}
                        selectedValues={selectedJobSite}
                        onChange={onJobSiteChange}
                        placeholder="Location"
                        allLabel="All"
                        dropdownTitle="Work Locations"
                        variant="ghost"
                        label="Location"
                      />
                    </div>
                  </div>
                </div>

                {/* Filtro de Tipo */}
                <div style={{
                  ...filterButtonStyle,
                  height: '42px',
                  padding: '0 4px 0 15px',
                  cursor: 'default',
                  background: 'var(--color-background-primary)',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="bi bi-tags" style={{ color: 'var(--color-accent-primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Type</span>
                  </div>
                  <div style={{ ...segmentedButtonGroupStyle, border: 'none', background: 'rgba(var(--color-text-primary-rgb), 0.08)' }}>
                    <button
                      style={segmentedButtonStyle(selectedType === 'all')}
                      onClick={() => onTypeChange('all')}
                    >
                      All
                    </button>
                    <button
                      style={segmentedButtonStyle(selectedType === 'Building')}
                      onClick={() => onTypeChange('Building')}
                    >
                      Building
                    </button>
                    <button
                      style={segmentedButtonStyle(selectedType === 'Lot')}
                      onClick={() => onTypeChange('Lot')}
                    >
                      Lot
                    </button>
                  </div>
                </div>
              </div>

              {!isMobile && (
                <div style={{ width: '1px', background: 'var(--color-border-divider)', alignSelf: 'stretch', margin: '0 8px' }} />
              )}

              {/* Coluna 2: Integrações e Recursos Internos */}
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px' 
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px'
                }}>
                  External Integrations
                </div>
                
                <SegmentedButtonGroup
                  label="Fieldwire"
                  value={selectedFieldwire}
                  onChange={onFieldwireChange}
                  icon={<img src={iconFieldwire} alt="Fieldwire" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />}
                />

                <SegmentedButtonGroup
                  label="Buildertrend"
                  value={selectedBuildertrend}
                  onChange={onBuildertrendChange}
                  icon={<img src={iconBuildertrend} alt="Buildertrend" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />}
                />

                <SegmentedButtonGroup
                  label="QBTime"
                  value={selectedQBTime}
                  onChange={onQBTimeChange}
                  icon={<img src={iconQBTime} alt="QBTime" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />}
                />

                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginTop: '12px',
                  marginBottom: '4px'
                }}>
                  Internal Resources
                </div>

                <SegmentedButtonGroup
                  label="Machines"
                  value={selectedMachines}
                  onChange={onMachinesChange}
                  icon={<i className="bi bi-truck" style={{ fontSize: '16px' }} />}
                />

                <SegmentedButtonGroup
                  label="Workforce"
                  value={selectedWorkforce}
                  onChange={onWorkforceChange}
                  icon={<i className="bi bi-people" style={{ fontSize: '16px' }} />}
                />

                <SegmentedButtonGroup
                  label="Contract"
                  value={selectedContractSteps}
                  onChange={onContractStepsChange}
                  icon={<i className="bi bi-file-earmark-text" style={{ fontSize: '16px' }} />}
                />
              </div>
            </div>

            {/* Rodapé do Filtro: Clear All */}
            {activeFiltersCount > 0 && (
              <div style={{
                marginTop: '8px',
                paddingTop: '16px',
                borderTop: '1px solid var(--color-border-divider)',
                display: 'flex',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={clearAllFilters}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-accent-primary)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(var(--color-accent-primary-rgb, 37, 99, 235), 0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <i className="bi bi-x-circle" />
                  Clear All Filters
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
