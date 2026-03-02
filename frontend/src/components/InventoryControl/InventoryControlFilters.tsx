import React from 'react';

interface InventoryControlFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  years: string[];
  months: string[];
}

export default function InventoryControlFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  years,
  months,
}: InventoryControlFiltersProps) {
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: 'none',
    padding: '4px 8px',
    fontSize: 14,
    transition: 'background 0.3s, color 0.3s',
    height: 38,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    cursor: 'pointer',
  };

  return (
    <div className="d-flex flex-row align-items-center" style={{ gap: 10, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-funnel" />
        Filtros
      </span>
      
      {/* Filtro de Ano/Mês */}
      <div className="input-group" style={{ width: 210, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <div className="d-flex align-items-center justify-content-center" style={{ width: 42, height: '100%', background: 'var(--color-background-secondary)', borderRight: '1.5px solid var(--color-border-divider)', color: 'var(--color-accent-primary)' }}>
          <i className="bi bi-calendar-range" style={{ fontSize: 16 }} />
        </div>
        <select 
          value={selectedYear} 
          onChange={e => setSelectedYear(e.target.value)} 
          style={{ ...selectStyle, borderRight: '1.5px solid var(--color-border-divider)', width: 78, height: '100%', borderRadius: 0, paddingRight: 4 }}
        >
          <option value="">Todos</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select 
          value={selectedMonth} 
          onChange={e => setSelectedMonth(e.target.value)} 
          style={{ ...selectStyle, width: 90, height: '100%', borderRadius: 0, paddingRight: 4 }}
        >
          <option value="">Todos</option>
          {months.map(m => (
            <option key={m} value={m}>
              {monthNames[parseInt(m) - 1]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
