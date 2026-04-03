import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface OFIFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedJobSite: string[];
  setSelectedJobSite: (jobSites: string[]) => void;
  years: string[];
  months: string[];
  jobSites: { label: string; value: string }[];
}

// MultiSelectDropdown customizado seguindo o padrão de AccountingFilters
function MultiSelectDropdown({ 
  options, 
  selected, 
  setSelected, 
  allLabel = 'Todos', 
  dropdownTitle,
  dropdownWidth = 200 
}: {
  options: { label: string; value: string }[];
  selected: string[];
  setSelected: (v: string[]) => void;
  allLabel?: string;
  dropdownTitle?: string;
  dropdownWidth?: number;
}) {
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  React.useEffect(() => {
    if ((open || !hasPreRendered) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered]);

  const allSelected = selected.length === options.length && options.length > 0;
  
  const toggleOption = (val: string) => {
    const newSelection = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val];
    setSelected(newSelection);
  };

  const toggleAll = () => {
    const newSelection = allSelected ? [] : options.map(o => o.value);
    setSelected(newSelection);
  };

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left + dropdownPos.width - dropdownWidth,
        width: dropdownWidth,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 250,
        overflowY: 'auto',
        padding: 0,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      {dropdownTitle && (
        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-accent-primary)', background: 'var(--color-background-secondary)', padding: '8px 12px 6px 12px', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottom: '1px solid var(--color-border-divider)', letterSpacing: 0.2 }}>{dropdownTitle}</div>
      )}
      <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
        <label className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '8px 12px' }}>
          <input type="checkbox" checked={allSelected} onChange={(e) => { e.stopPropagation(); toggleAll(); }} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{allLabel}</span>
        </label>
      </div>
      {options.map(opt => (
        <label key={opt.value} className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '8px 12px' }}>
          <input type="checkbox" checked={selected.includes(opt.value)} onChange={(e) => { e.stopPropagation(); toggleOption(opt.value); }} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {selected.length === 0
            ? 'Nenhum'
            : selected.length === options.length
              ? 'Todos'
              : `${selected.length} selecionados`}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

export default function OFIFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedJobSite,
  setSelectedJobSite,
  years,
  months,
  jobSites,
}: OFIFiltersProps) {
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

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
          {months.map(m => (
            <option key={m} value={m}>
              {monthNames[parseInt(m) - 1]}
            </option>
          ))}
        </select>
      </div>

      {/* Filtro de Job Site - Padrão Accounting Indicators */}
      <div className="input-group" style={{ minWidth: 200, maxWidth: 200, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-briefcase" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown
            options={jobSites}
            selected={selectedJobSite}
            setSelected={setSelectedJobSite}
            dropdownWidth={400}
            allLabel="All Projects"
            dropdownTitle="Projects"
          />
        </div>
      </div>
    </div>
  );
}
