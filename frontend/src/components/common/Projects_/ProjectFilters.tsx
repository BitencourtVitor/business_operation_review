import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import MultiSelectDropdown from '../MultiSelectDropdown';
import Tooltip from '../../tooltips/MetricTooltip';

interface ProjectFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedGroup: 'all' | 'receivable' | 'payable';
  setSelectedGroup: (group: 'all' | 'receivable' | 'payable') => void;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ProjectFilters: React.FC<ProjectFiltersProps> = ({ selectedYear, setSelectedYear, selectedMonth, setSelectedMonth, selectedGroup, setSelectedGroup }) => {
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
    </div>
  );
};

export default ProjectFilters; 