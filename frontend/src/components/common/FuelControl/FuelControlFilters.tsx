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


    </div>
  );
}
