import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const CLIENT_BUTTON_WIDTH = 180;
const JOBSITE_BUTTON_WIDTH = 220;
const DROPDOWN_WIDTH = 200;

function SimpleMultiSelectDropdown({ options, selected, setSelected, allLabel = 'Todos', dropdownTitle }: {
  options: string[];
  selected: string[];
  setSelected: (v: string[]) => void;
  allLabel?: string;
  dropdownTitle?: string;
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
  const toggleOption = (opt: string) => {
    const newSelection = selected.includes(opt)
      ? selected.filter(o => o !== opt)
      : [...selected, opt];
    setSelected(newSelection);
  };
  const toggleAll = () => {
    const newSelection = allSelected ? [] : [...options];
    setSelected(newSelection);
  };

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: Math.max(dropdownPos.width, DROPDOWN_WIDTH),
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 220,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      {dropdownTitle && (
        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-accent-primary)', background: 'var(--color-background-secondary)', padding: '6px 12px 4px 12px', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottom: '1px solid var(--color-border-divider)', letterSpacing: 0.2 }}>{dropdownTitle}</div>
      )}
      <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
        <label className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
          <input type="checkbox" checked={allSelected} onChange={(e) => { e.stopPropagation(); toggleAll(); }} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{allLabel}</span>
        </label>
      </div>
      {options.map(opt => (
        <label key={opt} className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
          <input type="checkbox" checked={selected.includes(opt)} onChange={(e) => { e.stopPropagation(); toggleOption(opt); }} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', minWidth: 0, width: '100%', height: 38 }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', width: '100%', height: 38, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, fontSize: 14, boxShadow: 'none', padding: '0 12px', margin: 0 }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
          {selected.length === 0
            ? 'All'
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

interface ForecastFiltersProps {
  selectedYear: string;
  selectedMonth: string;
  selectedClient: string[];
  selectedJobSite: string[];
  selectedType: string;
  years: string[];
  months: string[];
  clients: string[];
  jobSites: string[];
  dateMode: 'start' | 'beams';
  sortByDate: 'off' | 'asc' | 'desc' | null;
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  onClientChange: (clients: string[]) => void;
  onJobSiteChange: (jobSites: string[]) => void;
  onTypeChange: (type: string) => void;
  onDateModeChange: (mode: 'start' | 'beams') => void;
  onSortByDateChange: (sort: 'off' | 'asc' | 'desc' | null) => void;
}

export default function ForecastFilters({
  selectedYear,
  selectedMonth,
  selectedClient,
  selectedJobSite,
  selectedType,
  years,
  months,
  clients,
  jobSites,
  dateMode,
  sortByDate,
  onYearChange,
  onMonthChange,
  onClientChange,
  onJobSiteChange,
  onTypeChange,
  onDateModeChange,
  onSortByDateChange
}: ForecastFiltersProps) {

  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 14,
    transition: 'background 0.3s, color 0.3s, border 0.3s',
    height: 38,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Row Principal - Padronizada com Project Monitoring */}
      <div className="d-flex flex-row align-items-center" style={{ gap: 16, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
          <i className="bi bi-funnel" />
          Filters
        </span>

        {/* Grupo de Filtros Temporais (Year/Month) */}
        <div className="input-group" style={{ minWidth: 200, maxWidth: 200, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
          <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
            <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
          </span>
          <select 
            value={selectedYear} 
            onChange={e => onYearChange(e.target.value)} 
            style={{ 
              ...selectStyle,
              border: 'none', 
              borderRight: '1.5px solid var(--color-border-divider)', 
              borderRadius: 0, 
              width: 75, 
            }}
          >
            <option value="">All</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select 
            value={selectedMonth} 
            onChange={e => onMonthChange(e.target.value)} 
            style={{ 
              ...selectStyle,
              border: 'none', 
              borderRadius: 0, 
              width: 83, 
            }}
          >
            <option value="">All</option>
            {months.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Filtro de Cliente */}
        <div className="input-group" style={{ minWidth: CLIENT_BUTTON_WIDTH, maxWidth: CLIENT_BUTTON_WIDTH, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, display: 'flex' }}>
          <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)' }}>
            <i className="bi bi-person-badge" style={{ fontSize: 16 }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, height: 38 }}>
            <SimpleMultiSelectDropdown 
              options={clients} 
              selected={selectedClient} 
              setSelected={onClientChange} 
              allLabel="All Clients" 
              dropdownTitle="Clients" 
            />
          </div>
        </div>

        {/* Filtro de Job Site */}
        <div className="input-group" style={{ minWidth: JOBSITE_BUTTON_WIDTH, maxWidth: JOBSITE_BUTTON_WIDTH, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, display: 'flex' }}>
          <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)' }}>
            <i className="bi bi-building" style={{ fontSize: 16 }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, height: 38 }}>
            <SimpleMultiSelectDropdown 
              options={jobSites} 
              selected={selectedJobSite} 
              setSelected={onJobSiteChange} 
              allLabel="All Job Sites" 
              dropdownTitle="Job Sites" 
            />
          </div>
        </div>

        {/* Project Type (Segmented Buttons) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, marginRight: 4 }}>Type</span>
          <button
            onClick={() => onTypeChange('all')}
            style={{
              background: selectedType === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: selectedType === 'all' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: selectedType === 'all' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            All
          </button>
          <button
            onClick={() => onTypeChange('Building')}
            style={{
              background: selectedType === 'Building' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: selectedType === 'Building' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: selectedType === 'Building' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Building
          </button>
          <button
            onClick={() => onTypeChange('Lot')}
            style={{
              background: selectedType === 'Lot' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: selectedType === 'Lot' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: selectedType === 'Lot' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Lot
          </button>
        </div>

        {/* Date Mode (Segmented Buttons) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, marginRight: 4 }}>Date Mode</span>
          <button
            onClick={() => onDateModeChange('start')}
            style={{
              background: dateMode === 'start' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: dateMode === 'start' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: dateMode === 'start' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Start
          </button>
          <button
            onClick={() => onDateModeChange('beams')}
            style={{
              background: dateMode === 'beams' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: dateMode === 'beams' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: dateMode === 'beams' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Beams
          </button>
        </div>

        {/* Sort (Segmented Buttons) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, marginRight: 4 }}>Sort</span>
          <button
            onClick={() => onSortByDateChange(sortByDate === 'asc' ? null : 'asc')}
            style={{
              background: sortByDate === 'asc' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: sortByDate === 'asc' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: sortByDate === 'asc' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Asc
          </button>
          <button
            onClick={() => onSortByDateChange(sortByDate === 'desc' ? null : 'desc')}
            style={{
              background: sortByDate === 'desc' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              color: sortByDate === 'desc' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
              border: sortByDate === 'desc' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
              borderRadius: 15,
              padding: '4px 16px',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Desc
          </button>
        </div>
      </div>

    </div>
  );
}
