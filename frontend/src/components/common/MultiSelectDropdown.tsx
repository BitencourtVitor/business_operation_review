import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MultiSelectDropdownProps {
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  dropdownTitle?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = 'Selecionar',
  allLabel = 'Todos',
  dropdownTitle
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{top: number, left: number, width: number}>({top: 0, left: 0, width: 0});
  const [hasPreRendered, setHasPreRendered] = useState(false);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
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

  // Calcula posição do dropdown ao abrir ou ao pré-renderizar
  useEffect(() => {
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

  const allSelected = selectedValues.length === options.length;
  const toggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(o => o !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };
  
  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map(opt => opt.value));
    }
  };

  // Dropdown JSX (usado para pré-render e para exibir)
  const dropdownJSX = (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        zIndex: 1000,
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
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
        <div style={{ 
          fontWeight: 500, 
          fontSize: 13, 
          color: 'var(--color-accent-primary)', 
          background: 'var(--color-background-secondary)', 
          padding: '6px 12px 4px 12px', 
          borderTopLeftRadius: 6, 
          borderTopRightRadius: 6, 
          borderBottom: '1px solid var(--color-border-divider)', 
          letterSpacing: 0.2 
        }}>
          {dropdownTitle}
        </div>
      )}
      <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
        <label className="d-flex align-items-center" style={{ 
          gap: 8, 
          fontSize: 14, 
          color: 'var(--color-text-secondary)', 
          cursor: 'pointer', 
          padding: '6px 12px' 
        }}>
          <input 
            type="checkbox" 
            checked={allSelected} 
            onChange={toggleAll} 
            style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} 
          />
          <span>{allLabel}</span>
        </label>
      </div>
      {options.map(opt => (
        <label key={opt.value} className="d-flex align-items-center" style={{ 
          gap: 8, 
          fontSize: 14, 
          color: 'var(--color-text-secondary)', 
          cursor: 'pointer', 
          padding: '6px 12px' 
        }}>
          <input 
            type="checkbox" 
            checked={selectedValues.includes(opt.value)} 
            onChange={() => toggleOption(opt.value)} 
            style={{ accentColor: 'var(--color-accent-primary)', margin: 0 }} 
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div style={{ 
      position: 'relative', 
      minWidth: 0, 
      width: '100%', 
      height: 38, 
      borderTopRightRadius: 8, 
      borderBottomRightRadius: 8 
    }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ 
          cursor: 'pointer', 
          width: '100%', 
          height: 38, 
          background: 'var(--color-background-primary)', 
          color: 'var(--color-text-primary)', 
          border: 'none', 
          borderRadius: 0, 
          fontSize: 14, 
          boxShadow: 'none', 
          padding: '0 12px', 
          margin: 0 
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          textAlign: 'left' 
        }}>
          {selectedValues.length === 0
            ? placeholder
            : selectedValues.length === options.length
              ? allLabel
              : `${selectedValues.length} selecionados`}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {/* Pré-renderiza o dropdown invisível ao montar, e visível ao abrir */}
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
};

export default MultiSelectDropdown; 