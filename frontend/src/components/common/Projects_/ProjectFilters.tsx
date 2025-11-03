import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../supabaseClient';
import MultiSelectDropdown from '../MultiSelectDropdown';
import Tooltip from '../../tooltips/MetricTooltip';

const JOBSITE_BUTTON_WIDTH = 180;
const JOBSITE_DROPDOWN_WIDTH = 200;

// MultiSelectDropdown simples para strings (similar ao AccountingFilters)
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

  const allSelected = selected.length === options.length;
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
        left: dropdownPos.left + dropdownPos.width - JOBSITE_DROPDOWN_WIDTH,
        width: JOBSITE_DROPDOWN_WIDTH,
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

interface ProjectFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedGroup: 'all' | 'receivable' | 'payable';
  setSelectedGroup: (group: 'all' | 'receivable' | 'payable') => void;
  selectedJobsites: string[];
  setSelectedJobsites: (jobsites: string[]) => void;
  jobsites: string[];
}


const ProjectFilters: React.FC<ProjectFiltersProps> = ({ selectedYear, setSelectedYear, selectedMonth, setSelectedMonth, selectedGroup, setSelectedGroup, selectedJobsites, setSelectedJobsites, jobsites }) => {
  const [years, setYears] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [allDates, setAllDates] = useState<string[]>([]);

  useEffect(() => {
    async function fetchDates() {
      const { data, error } = await supabase
        .from('hvac_estimates')
        .select('txn_date');
      if (error) return;
      const dates = (data || []).map((row: Record<string, any>) => row.txn_date).filter(Boolean);
      setAllDates(dates);
      // Extrair anos únicos
      const anos = Array.from(new Set(dates.map((d: string) => d.split('-')[0]))).sort((a, b) => Number(b) - Number(a));
      setYears(anos);
    }
    fetchDates();
  }, []);

  // Atualizar meses disponíveis conforme ano selecionado
  useEffect(() => {
    if (!selectedYear) {
      setMonths([]);
      if (setSelectedMonth) setSelectedMonth('');
      return;
    }
    const meses = Array.from(new Set(
      allDates
        .filter(d => d.startsWith(selectedYear))
        .map(d => d.split('-')[1])
    ));
    // Ordenar por número
    meses.sort((a, b) => Number(a) - Number(b));
    setMonths(meses);
    // Resetar mês se não existir mais
    if (selectedMonth && !meses.includes(selectedMonth) && setSelectedMonth) setSelectedMonth('');
  }, [selectedYear, allDates, selectedMonth, setSelectedMonth]);

  const selectStyle: React.CSSProperties = {
    background: 'var(--color-background-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-divider)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 14,
    transition: 'background 0.3s, color 0.3s, border 0.3s',
    height: 38,
    width: 90,
  };

  return (
    <div className="d-flex flex-row align-items-center" style={{ gap: 16, flexWrap: 'wrap', borderLeft: '1px solid var(--color-border-divider)', paddingLeft: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500, gap: 8, display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
        <i className="bi bi-funnel" />
        Filters
      </span>
      {/* Filtro de ano/mês */}
      <div className="input-group" style={{ minWidth: 197, maxWidth: 197, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <Tooltip
          title="Time Filters"
          content={
            'Finds accepted estimates within the selected year or month. Select "All" to disable this filter.'
          }
          placement="bottom-right"
          style={{ maxWidth: 420 }}
        >
          <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', height: 38, width: 42, padding: 0, borderRadius: 0, borderRight: 0 }}>
            <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
          </span>
        </Tooltip>
        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">All</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">All</option>
          {months.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      {/* Filtro de tipo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500, marginRight: 4 }}>Type</span>
        <button
          onClick={() => setSelectedGroup('all')}
          style={{
            background: selectedGroup === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
            color: selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)',
            border: selectedGroup === 'all' ? '1.5px solid var(--color-brand-blue)' : '1.5px solid var(--color-border-divider)',
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
          onMouseEnter={e => {
            if (selectedGroup !== 'all') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
              e.currentTarget.style.color = 'var(--color-brand-blue)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = selectedGroup === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
          }}
        >
          All
        </button>
        <button
          onClick={() => setSelectedGroup('receivable')}
          style={{
            background: selectedGroup === 'receivable' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
            color: selectedGroup === 'receivable' ? 'var(--positive-color)' : 'var(--color-text-primary)',
            border: selectedGroup === 'receivable' ? '1.5px solid var(--positive-color)' : '1.5px solid var(--color-border-divider)',
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
          onMouseEnter={e => {
            if (selectedGroup !== 'receivable') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--positive-color)';
              e.currentTarget.style.color = 'var(--positive-color)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = selectedGroup === 'receivable' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedGroup === 'receivable' ? 'var(--positive-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedGroup === 'receivable' ? 'var(--positive-color)' : 'var(--color-text-primary)';
          }}
        >
          Receivables
        </button>
        <button
          onClick={() => setSelectedGroup('payable')}
          style={{
            background: selectedGroup === 'payable' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
            color: selectedGroup === 'payable' ? 'var(--negative-color)' : 'var(--color-text-primary)',
            border: selectedGroup === 'payable' ? '1.5px solid var(--negative-color)' : '1.5px solid var(--color-border-divider)',
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
          onMouseEnter={e => {
            if (selectedGroup !== 'payable') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--negative-color)';
              e.currentTarget.style.color = 'var(--negative-color)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = selectedGroup === 'payable' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedGroup === 'payable' ? 'var(--negative-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedGroup === 'payable' ? 'var(--negative-color)' : 'var(--color-text-primary)';
          }}
        >
          Payables
        </button>
      </div>
      {/* Jobsite Filter */}
      {jobsites.length > 0 && (
        <div className="input-group" style={{ minWidth: JOBSITE_BUTTON_WIDTH, maxWidth: JOBSITE_BUTTON_WIDTH, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 18, display: 'flex' }}>
          <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
            <i className="bi bi-building" style={{ fontSize: 17 }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, zIndex: 19, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
            <SimpleMultiSelectDropdown 
              options={jobsites} 
              selected={selectedJobsites} 
              setSelected={setSelectedJobsites} 
              allLabel="Todos" 
              dropdownTitle="Jobsite" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectFilters; 