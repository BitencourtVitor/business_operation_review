import React from 'react';
import MultiSelectDropdown from '../MultiSelectDropdown';
import { addCurrentMonthIfMissing } from '../../../utils/dataUtils';

interface FuelControlFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedDrivers: string[];
  setSelectedDrivers: (drivers: string[]) => void;
  selectedEventTypes: string[];
  setSelectedEventTypes: (types: string[]) => void;
  years: string[];
  months: string[];
  availableDrivers: string[];
}

export default function FuelControlFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedDrivers,
  setSelectedDrivers,
  selectedEventTypes,
  setSelectedEventTypes,
  years,
  months,
  availableDrivers
}: FuelControlFiltersProps) {
  // Configurações de largura para a lista suspensa dos motoristas
  const DRIVER_DROPDOWN_WIDTH = 215; // Ajuste esta variável para alterar a largura da lista suspensa

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

  // Converter availableDrivers para o formato esperado pelo MultiSelectDropdown (dedupe case-insensitive)
  const driverOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    availableDrivers.forEach(d => {
      if (!d) return;
      const trimmed = d.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) {
        map.set(key, trimmed);
      }
    });
    return Array.from(map.values())
      .sort((a, b) => a.localeCompare(b))
      .map(driver => ({ value: driver, label: driver }));
  }, [availableDrivers]);

  return (
    <div className="d-flex flex-row align-items-center" style={{ gap: 10, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-funnel" />
        Filters
      </span>
      
      {/* Filtro de Ano/Mês */}
      <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
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

      {/* Filtro de Motoristas */}
      <div className="input-group" style={{ minWidth: 180, maxWidth: 180, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-person-badge" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown 
            options={driverOptions}
            selectedValues={selectedDrivers}
            onChange={setSelectedDrivers}
            placeholder="Drivers"
            allLabel="Todos"
            dropdownTitle="Drivers"
            dropdownWidth={DRIVER_DROPDOWN_WIDTH}
          />
        </div>
      </div>

      {/* Filtro de Tipos de Evento com cores distintas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Event Type</span>
        <button 
          onClick={() => setSelectedEventTypes([])} 
          style={{ 
            background: selectedEventTypes.length === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedEventTypes.length === 0 ? 'var(--color-brand-blue)' : 'var(--color-text-primary)', 
            border: selectedEventTypes.length === 0 ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedEventTypes.length !== 0) {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
              e.currentTarget.style.color = 'var(--color-brand-blue)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedEventTypes.length === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedEventTypes.length === 0 ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedEventTypes.length === 0 ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
          }}
        >
          All
        </button>
        {['idle', 'trip'].map(type => (
          <button 
            key={type}
            onClick={() => {
              if (selectedEventTypes.includes(type)) {
                // Se já está selecionado, desmarca (volta para "All")
                setSelectedEventTypes([]);
              } else {
                // Se não está selecionado, seleciona apenas este tipo (desmarca os outros)
                setSelectedEventTypes([type]);
              }
            }}
            style={{ 
              background: selectedEventTypes.includes(type) ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
              color: selectedEventTypes.includes(type) ? (type === 'idle' ? '#DC2626' : '#16A34A') : 'var(--color-text-primary)', 
              border: selectedEventTypes.includes(type) ? `1.5px solid ${type === 'idle' ? '#DC2626' : '#16A34A'}` : '1.5px solid var(--color-border-divider)', 
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
              if (!selectedEventTypes.includes(type)) {
                e.currentTarget.style.background = 'var(--color-background-primary)';
                e.currentTarget.style.borderColor = type === 'idle' ? '#DC2626' : '#16A34A';
                e.currentTarget.style.color = type === 'idle' ? '#DC2626' : '#16A34A';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = selectedEventTypes.includes(type) ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
              e.currentTarget.style.borderColor = selectedEventTypes.includes(type) ? (type === 'idle' ? '#DC2626' : '#16A34A') : 'var(--color-border-divider)';
              e.currentTarget.style.color = selectedEventTypes.includes(type) ? (type === 'idle' ? '#DC2626' : '#16A34A') : 'var(--color-text-primary)';
            }}
          >
            <i className={`bi ${type === 'idle' ? 'bi-pause' : 'bi-arrow-right'} me-1`}></i>
            {type === 'idle' ? 'Idle' : 'Trip'}
          </button>
        ))}
      </div>
    </div>
  );
}
