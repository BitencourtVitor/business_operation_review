import React, { useState } from 'react';
import { createPortal } from 'react-dom';

// No topo do arquivo, antes do componente:
const AGING_BUTTON_WIDTH = 180; // largura do botão
const AGING_DROPDOWN_WIDTH = 200; // largura da lista suspensa aberta
const CATEGORY_BUTTON_WIDTH = 180; // largura do botão de categoria
const CATEGORY_DROPDOWN_WIDTH = 360; // largura da lista suspensa aberta de categoria

// MultiSelectDropdown copiado exatamente do backup
function MultiSelectDropdown({ options, selected, setSelected, allLabel = 'Todos', dropdownTitle }: {
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
    if (selected.includes(opt)) setSelected(selected.filter(o => o !== opt));
    else setSelected([...selected, opt]);
  };
  const toggleAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(options);
  };
  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left + dropdownPos.width - AGING_DROPDOWN_WIDTH,
        width: AGING_DROPDOWN_WIDTH,
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
          <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>{allLabel}</span>
        </label>
      </div>
      {options.map(opt => (
        <label key={opt} className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
          <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
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

// Componente para filtro de categoria dupla
function DualCategoryDropdown({ 
  receivablesCategories, 
  payablesCategories, 
  selectedReceivablesCategories, 
  selectedPayablesCategories, 
  setSelectedReceivablesCategories, 
  setSelectedPayablesCategories,
  selectedGroup
}: {
  receivablesCategories: string[];
  payablesCategories: string[];
  selectedReceivablesCategories: string[];
  selectedPayablesCategories: string[];
  setSelectedReceivablesCategories: (categories: string[]) => void;
  setSelectedPayablesCategories: (categories: string[]) => void;
  selectedGroup: 'all' | 'receivables' | 'payables';
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

  const allReceivablesSelected = selectedReceivablesCategories.length === receivablesCategories.length;
  const allPayablesSelected = selectedPayablesCategories.length === payablesCategories.length;
  
  const toggleReceivablesOption = (opt: string) => {
    if (selectedReceivablesCategories.includes(opt)) {
      setSelectedReceivablesCategories(selectedReceivablesCategories.filter(o => o !== opt));
    } else {
      setSelectedReceivablesCategories([...selectedReceivablesCategories, opt]);
    }
  };
  
  const togglePayablesOption = (opt: string) => {
    if (selectedPayablesCategories.includes(opt)) {
      setSelectedPayablesCategories(selectedPayablesCategories.filter(o => o !== opt));
    } else {
      setSelectedPayablesCategories([...selectedPayablesCategories, opt]);
    }
  };
  
  const toggleAllReceivables = () => {
    if (allReceivablesSelected) setSelectedReceivablesCategories([]);
    else setSelectedReceivablesCategories(receivablesCategories);
  };
  
  const toggleAllPayables = () => {
    if (allPayablesSelected) setSelectedPayablesCategories([]);
    else setSelectedPayablesCategories(payablesCategories);
  };
  
  const toggleAll = () => {
    if (allReceivablesSelected && allPayablesSelected) {
      setSelectedReceivablesCategories([]);
      setSelectedPayablesCategories([]);
    } else {
      setSelectedReceivablesCategories(receivablesCategories);
      setSelectedPayablesCategories(payablesCategories);
    }
  };

  const totalSelected = selectedReceivablesCategories.length + selectedPayablesCategories.length;
  const totalOptions = receivablesCategories.length + payablesCategories.length;
  const allSelected = totalSelected === totalOptions;

  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left + dropdownPos.width - CATEGORY_DROPDOWN_WIDTH,
        width: CATEGORY_DROPDOWN_WIDTH,
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        border: '1.5px solid var(--color-border-divider)',
        borderRadius: 6,
        minWidth: 0,
        maxHeight: 300,
        overflowY: 'auto',
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'block' : 'none',
      }}
      className="custom-scrollbar"
    >
      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-accent-primary)', background: 'var(--color-background-secondary)', padding: '6px 12px 4px 12px', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottom: '1px solid var(--color-border-divider)', letterSpacing: 0.2 }}>Category</div>
      
      {/* Botão Todos Universal */}
      <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
        <label className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} />
          <span>Todos</span>
        </label>
      </div>
      
      {/* Container com duas listas lado a lado */}
      <div style={{ display: 'flex', minHeight: 200 }}>
        {/* Coluna Receivables */}
        <div style={{ flex: 1, borderRight: '1px solid var(--color-border-divider)', opacity: selectedGroup === 'payables' ? 0.5 : 1, pointerEvents: selectedGroup === 'payables' ? 'none' : 'auto' }}>
          {receivablesCategories.length > 0 ? (
            <>
              <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--positive-color)', background: 'var(--color-background-secondary)', padding: '4px 12px 2px 12px', borderBottom: '1px solid var(--color-border-divider)' }}>Receivables</div>
              <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
                <label className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
                  <input type="checkbox" checked={allReceivablesSelected} onChange={toggleAllReceivables} style={{ accentColor: 'var(--positive-color)', margin: 0 }} />
                  <span>Todas Receivables</span>
                </label>
              </div>
              {receivablesCategories.map(opt => (
                <label key={`rec-${opt}`} className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
                  <input type="checkbox" checked={selectedReceivablesCategories.includes(opt)} onChange={() => toggleReceivablesOption(opt)} style={{ accentColor: 'var(--positive-color)', margin: 0 }} />
                  <span>{opt}</span>
                </label>
              ))}
            </>
          ) : (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>
              Nenhuma categoria de receivables
            </div>
          )}
        </div>
        
        {/* Coluna Payables */}
        <div style={{ flex: 1, opacity: selectedGroup === 'receivables' ? 0.5 : 1, pointerEvents: selectedGroup === 'receivables' ? 'none' : 'auto' }}>
          {payablesCategories.length > 0 ? (
            <>
              <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--negative-color)', background: 'var(--color-background-secondary)', padding: '4px 12px 2px 12px', borderBottom: '1px solid var(--color-border-divider)' }}>Payables</div>
              <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
                <label className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
                  <input type="checkbox" checked={allPayablesSelected} onChange={toggleAllPayables} style={{ accentColor: 'var(--negative-color)', margin: 0 }} />
                  <span>Todas Payables</span>
                </label>
              </div>
              {payablesCategories.map(opt => (
                <label key={`pay-${opt}`} className="d-flex align-items-center" style={{ gap: 8, fontSize: 14, color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 12px' }}>
                  <input type="checkbox" checked={selectedPayablesCategories.includes(opt)} onChange={() => togglePayablesOption(opt)} style={{ accentColor: 'var(--negative-color)', margin: 0 }} />
                  <span>{opt}</span>
                </label>
              ))}
            </>
          ) : (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 14 }}>
              Nenhuma categoria de payables
            </div>
          )}
        </div>
      </div>
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
          {totalSelected === 0
            ? 'Nenhuma'
            : totalSelected === totalOptions
              ? 'Todas'
              : `${totalSelected} selecionadas`}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
}

interface AccountingFiltersProps {
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedGroup: 'all' | 'receivables' | 'payables';
  setSelectedGroup: (group: 'all' | 'receivables' | 'payables') => void;
  separateAging: boolean;
  setSeparateAging: (separate: boolean) => void;
  selectedAging: string[];
  setSelectedAging: (aging: string[]) => void;
  selectedReceivablesCategories: string[];
  setSelectedReceivablesCategories: (categories: string[]) => void;
  selectedPayablesCategories: string[];
  setSelectedPayablesCategories: (categories: string[]) => void;
  years: string[];
  months: string[];
  agingIntervals: string[];
  receivablesCategories: string[];
  payablesCategories: string[];
}

export default function AccountingFilters({
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedGroup,
  setSelectedGroup,
  separateAging,
  setSeparateAging,
  selectedAging,
  setSelectedAging,
  selectedReceivablesCategories,
  setSelectedReceivablesCategories,
  selectedPayablesCategories,
  setSelectedPayablesCategories,
  years,
  months,
  agingIntervals,
  receivablesCategories,
  payablesCategories
}: AccountingFiltersProps) {
  // Estilo para selects customizados (igual ao backup)
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
        Filtros
      </span>
      {/* Filtro de tempo (igual ao backup) */}
      <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
          <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
        </span>
        <select id="year-select" name="year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ ...selectStyle, border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 70, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ ...selectStyle, border: 'none', borderRadius: 0, height: 38, width: 75, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }}>
          <option value="">Todos</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {/* Grupo de botões - Padrão do projeto (igual ao backup) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Type</span>
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
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            if (selectedGroup !== 'all') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-brand-blue)';
              e.currentTarget.style.color = 'var(--color-brand-blue)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedGroup === 'all' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedGroup === 'all' ? 'var(--color-brand-blue)' : 'var(--color-text-primary)';
          }}
        >
          All
        </button>
        <button 
          onClick={() => setSelectedGroup('receivables')} 
          style={{ 
            background: selectedGroup === 'receivables' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedGroup === 'receivables' ? 'var(--positive-color)' : 'var(--color-text-primary)', 
            border: selectedGroup === 'receivables' ? '1.5px solid var(--positive-color)' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedGroup !== 'receivables') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--positive-color)';
              e.currentTarget.style.color = 'var(--positive-color)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedGroup === 'receivables' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedGroup === 'receivables' ? 'var(--positive-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedGroup === 'receivables' ? 'var(--positive-color)' : 'var(--color-text-primary)';
          }}
        >
          Receivables
        </button>
        <button 
          onClick={() => setSelectedGroup('payables')} 
          style={{ 
            background: selectedGroup === 'payables' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', 
            color: selectedGroup === 'payables' ? 'var(--negative-color)' : 'var(--color-text-primary)', 
            border: selectedGroup === 'payables' ? '1.5px solid var(--negative-color)' : '1.5px solid var(--color-border-divider)', 
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
            if (selectedGroup !== 'payables') {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--negative-color)';
              e.currentTarget.style.color = 'var(--negative-color)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedGroup === 'payables' ? 'var(--color-background-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = selectedGroup === 'payables' ? 'var(--negative-color)' : 'var(--color-border-divider)';
            e.currentTarget.style.color = selectedGroup === 'payables' ? 'var(--negative-color)' : 'var(--color-text-primary)';
          }}
        >
          Payables
        </button>
      </div>
      {/* Separate by Aging Interval - Controle booleano no padrão do projeto (igual ao backup) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Separate by Aging</span>
        <button 
          onClick={() => setSeparateAging(!separateAging)} 
          style={{ 
            background: separateAging ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', 
            color: separateAging ? '#fff' : 'var(--color-accent-primary)', 
            border: '1.5px solid var(--color-border-divider)', 
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
            if (!separateAging) {
              e.currentTarget.style.background = 'var(--color-background-primary)';
              e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = separateAging ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)';
            e.currentTarget.style.borderColor = 'var(--color-border-divider)';
          }}
        >
          {separateAging ? 'ON' : 'OFF'}
        </button>
      </div>
      {/* Aging Interval */}
      <div className="input-group" style={{ minWidth: AGING_BUTTON_WIDTH, maxWidth: AGING_BUTTON_WIDTH, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 20, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-hourglass-split" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <MultiSelectDropdown options={agingIntervals} selected={selectedAging} setSelected={setSelectedAging} allLabel="Todos" dropdownTitle="Aging Interval" />
        </div>
      </div>
      {/* Category - Filtro duplo */}
      <div className="input-group" style={{ minWidth: CATEGORY_BUTTON_WIDTH, maxWidth: CATEGORY_BUTTON_WIDTH, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38, zIndex: 19, display: 'flex' }}>
        <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          <i className="bi bi-tags" style={{ fontSize: 17 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0, zIndex: 20, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 38 }}>
          <DualCategoryDropdown 
            receivablesCategories={receivablesCategories}
            payablesCategories={payablesCategories}
            selectedReceivablesCategories={selectedReceivablesCategories}
            selectedPayablesCategories={selectedPayablesCategories}
            setSelectedReceivablesCategories={setSelectedReceivablesCategories}
            setSelectedPayablesCategories={setSelectedPayablesCategories}
            selectedGroup={selectedGroup}
          />
        </div>
      </div>
    </div>
  );
} 