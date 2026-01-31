import React, { useState } from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import iconFieldwire from '../../../assets/fieldwire.png';
import iconBuildertrend from '../../../assets/buildertrend.png';
import iconQBTime from '../../../assets/qbtime_logo.png';

interface ForecastFiltersProps {
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
}

export default function ForecastFilters({
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
}: ForecastFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Estilo para selects customizados
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    width: '100%',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-chevron-down' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '12px',
  };

  const filterButtonStyle: React.CSSProperties = {
    background: isExpanded ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)',
    border: `1px solid ${isExpanded ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
    borderRadius: 12,
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: 15,
    fontWeight: 600,
    color: isExpanded ? 'white' : 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: isExpanded ? '0 4px 12px rgba(var(--color-accent-primary-rgb), 0.3)' : '0 2px 4px rgba(0,0,0,0.05)'
  };

  // Estilo para botões segmentados
  const segmentedButtonGroupStyle: React.CSSProperties = {
    display: 'flex',
    background: 'var(--color-background-primary)',
    padding: '4px',
    borderRadius: 12,
    border: '1px solid var(--color-border-divider)',
    width: '100%'
  };

  const segmentedButtonStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 4px',
    fontSize: '12px',
    fontWeight: isActive ? 700 : 500,
    color: isActive ? 'white' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-accent-primary)' : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: isActive ? '0 2px 6px rgba(var(--color-accent-primary-rgb), 0.2)' : 'none'
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
    <div style={{ flex: '1 1 200px' }}>
      <label style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          background: 'var(--color-background-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {icon}
        </div>
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
          Done
        </button>
        <button
          style={segmentedButtonStyle(value === 'no')}
          onClick={() => onChange('no')}
        >
          Pending
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ 
      width: '100%',
      position: 'relative',
      zIndex: 100
    }}>
      {/* Barra superior de filtros (Desktop) */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px',
        padding: '0 0 16px 0',
      }}>
        <button
          style={filterButtonStyle}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className={`bi bi-${isExpanded ? 'x-lg' : 'funnel-fill'}`} style={{ fontSize: isExpanded ? 14 : 16 }} />
            <span style={{ fontSize: 16 }}>{isExpanded ? 'Fechar' : 'Filtros'}</span>
            {activeFiltersCount > 0 && !isExpanded && (
              <span style={{
                background: 'var(--color-accent-primary)',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {activeFiltersCount}
              </span>
            )}
          </div>
          <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} style={{ opacity: 0.8, fontSize: 12 }} />
        </button>

        {/* Atalhos rápidos quando contraído */}
        {!isExpanded && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            flex: 1, 
            overflow: 'hidden',
            padding: '8px 16px',
            background: 'var(--color-background-secondary)',
            borderRadius: '12px',
            border: '1px solid var(--color-border-divider)'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <i className="bi bi-calendar3" style={{ color: 'var(--color-text-secondary)', fontSize: 14 }} />
              <select 
                value={selectedYear} 
                onChange={e => onYearChange(e.target.value)} 
                style={{ ...selectStyle, width: 'auto', padding: '4px 28px 4px 8px', fontSize: 13, height: 32, borderRadius: 8 }}
              >
                <option value="">Year</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select 
                value={selectedMonth} 
                onChange={e => onMonthChange(e.target.value)} 
                style={{ ...selectStyle, width: 'auto', padding: '4px 28px 4px 8px', fontSize: 13, height: 32, borderRadius: 8 }}
              >
                <option value="">Month</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            
            <div style={{ height: '20px', width: '1px', background: 'var(--color-border-divider)' }} />
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
               {selectedClient.length > 0 && (
                 <div style={{ 
                   background: 'rgba(var(--color-accent-primary-rgb), 0.1)', 
                   color: 'var(--color-accent-primary)',
                   padding: '4px 12px',
                   borderRadius: '20px',
                   fontSize: '12px',
                   fontWeight: 600,
                   whiteSpace: 'nowrap',
                   border: '1px solid rgba(var(--color-accent-primary-rgb), 0.2)'
                 }}>
                   {selectedClient.length} Clients
                 </div>
               )}
               {selectedJobSite.length > 0 && (
                 <div style={{ 
                   background: 'rgba(var(--color-accent-primary-rgb), 0.1)', 
                   color: 'var(--color-accent-primary)',
                   padding: '4px 12px',
                   borderRadius: '20px',
                   fontSize: '12px',
                   fontWeight: 600,
                   whiteSpace: 'nowrap',
                   border: '1px solid rgba(var(--color-accent-primary-rgb), 0.2)'
                 }}>
                   {selectedJobSite.length} Sites
                 </div>
               )}
               {selectedType !== 'all' && (
                 <div style={{ 
                   background: 'rgba(var(--color-accent-primary-rgb), 0.1)', 
                   color: 'var(--color-accent-primary)',
                   padding: '4px 12px',
                   borderRadius: '20px',
                   fontSize: '12px',
                   fontWeight: 600,
                   whiteSpace: 'nowrap',
                   border: '1px solid rgba(var(--color-accent-primary-rgb), 0.2)'
                 }}>
                   {selectedType}
                 </div>
               )}
               {filterNotStarted && (
                 <div style={{ 
                   background: 'rgba(255, 165, 0, 0.1)', 
                   color: 'orange',
                   padding: '4px 12px',
                   borderRadius: '20px',
                   fontSize: '12px',
                   fontWeight: 600,
                   whiteSpace: 'nowrap',
                   border: '1px solid rgba(255, 165, 0, 0.2)'
                 }}>
                   Not Started
                 </div>
               )}
            </div>
            
            {activeFiltersCount > 0 && (
              <button 
                onClick={clearAllFilters}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--color-text-secondary)',
                  fontSize: '13px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <i className="bi bi-trash3 me-1" />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filtros expandidos */}
      {isExpanded && (
        <div style={{
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--color-border-divider)',
          borderRadius: '16px',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '32px',
          boxShadow: '0 12px 24px -4px rgba(0, 0, 0, 0.1)',
          marginTop: '8px',
          animation: 'slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Coluna 1: Localização e Tempo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: 800, 
              color: 'var(--color-accent-primary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="bi bi-geo-alt-fill" />
              Localização e Período
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>Ano</label>
                <select value={selectedYear} onChange={e => onYearChange(e.target.value)} style={selectStyle}>
                  <option value="">Todos os Anos</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>Mês</label>
                <select value={selectedMonth} onChange={e => onMonthChange(e.target.value)} style={selectStyle}>
                  <option value="">Todos os Meses</option>
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>Clientes</label>
              <MultiSelectDropdown 
                options={clients.map(client => ({ value: client, label: client }))}
                selectedValues={selectedClient}
                onChange={onClientChange}
                placeholder="Selecionar clientes"
                allLabel="Todos os Clientes"
                dropdownTitle="Clientes"
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>Job Sites</label>
              <MultiSelectDropdown 
                options={jobSites.map(jobSite => ({ value: jobSite, label: jobSite }))}
                selectedValues={selectedJobSite}
                onChange={onJobSiteChange}
                placeholder="Selecionar locais"
                allLabel="Todos os Locais"
                dropdownTitle="Job Sites"
              />
            </div>
          </div>

          {/* Coluna 2: Status de Conclusão */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: 800, 
              color: 'var(--color-accent-primary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="bi bi-check-circle-fill" />
              Status de Conclusão
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <SegmentedButtonGroup
                value={selectedFieldwire}
                onChange={onFieldwireChange}
                icon={<img src={iconFieldwire} alt="FW" style={{ width: 14, height: 14 }} />}
                label="FieldWire"
              />
              <SegmentedButtonGroup
                value={selectedBuildertrend}
                onChange={onBuildertrendChange}
                icon={<img src={iconBuildertrend} alt="BT" style={{ width: 14, height: 14 }} />}
                label="BuilderTrend"
              />
              <SegmentedButtonGroup
                value={selectedQBTime}
                onChange={onQBTimeChange}
                icon={<img src={iconQBTime} alt="QB" style={{ width: 14, height: 14 }} />}
                label="Quickbooks Time"
              />
              <SegmentedButtonGroup
                value={selectedMachines}
                onChange={onMachinesChange}
                icon={<i className="bi bi-truck" style={{ fontSize: 13, color: 'var(--color-accent-primary)' }} />}
                label="Machines"
              />
              <SegmentedButtonGroup
                value={selectedContractSteps}
                onChange={onContractStepsChange}
                icon={<i className="bi bi-file-earmark-check" style={{ fontSize: 13, color: 'var(--color-accent-primary)' }} />}
                label="Contract Steps"
              />
              <SegmentedButtonGroup
                value={selectedWorkforce}
                onChange={onWorkforceChange}
                icon={<i className="bi bi-people" style={{ fontSize: 13, color: 'var(--color-accent-primary)' }} />}
                label="Workforce"
              />
            </div>
          </div>

          {/* Coluna 3: Outros Filtros */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: 800, 
              color: 'var(--color-accent-primary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.1em',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <i className="bi bi-gear-fill" />
              Opções Adicionais
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', display: 'block', color: 'var(--color-text-secondary)' }}>Tipo de Projeto</label>
              <select value={selectedType} onChange={e => onTypeChange(e.target.value)} style={selectStyle}>
                <option value="all">Todos os Tipos</option>
                {availableTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            <div style={{
              background: filterNotStarted ? 'rgba(var(--color-accent-primary-rgb), 0.1)' : 'var(--color-background-primary)',
              border: `1px solid ${filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-border-divider)'}`,
              borderRadius: '12px',
              padding: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: filterNotStarted ? '0 4px 12px rgba(var(--color-accent-primary-rgb), 0.1)' : 'none'
            }} onClick={() => onFilterNotStartedChange(!filterNotStarted)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}>
                  <i className={`bi bi-hourglass-split`} style={{ color: filterNotStarted ? 'white' : 'var(--color-text-secondary)', fontSize: 16 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-text-primary)' }}>
                    Apenas "Não Iniciados"
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    Ocultar projetos em andamento
                  </span>
                </div>
              </div>
              <div style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                background: filterNotStarted ? 'var(--color-accent-primary)' : 'var(--color-border-divider)',
                position: 'relative',
                transition: 'all 0.3s'
              }}>
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '3px',
                  left: filterNotStarted ? '23px' : '3px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
              <button
                onClick={clearAllFilters}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--color-border-divider)',
                  borderRadius: 12,
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,0,0,0.05)';
                  e.currentTarget.style.borderColor = '#ff4444';
                  e.currentTarget.style.color = '#ff4444';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--color-border-divider)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <i className="bi bi-trash3-fill" />
                Limpar Todos
              </button>
              
              <button
                onClick={() => setIsExpanded(false)}
                style={{
                  flex: 1.5,
                  background: 'var(--color-accent-primary)',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(var(--color-accent-primary-rgb), 0.3)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Aplicar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
