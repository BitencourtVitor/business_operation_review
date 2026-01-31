import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MultiSelectDropdownProps {
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  dropdownTitle?: string;
  disablePortal?: boolean;
  dropdownWidth?: number;
  variant?: 'default' | 'ghost';
  label?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = 'Selecionar',
  allLabel = 'Todos',
  dropdownTitle,
  disablePortal = false,
  dropdownWidth,
  variant = 'default',
  label
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
      
      // Calculate necessary width if not provided
      let customWidth = dropdownWidth;
      if (!customWidth) {
        // Find longest option label to estimate width
        const longestLabel = options.reduce((longest, opt) => 
          opt.label.length > longest.length ? opt.label : longest, 
          allLabel
        );
        // Rough estimation: 8px per character + padding + checkbox space
        const estimatedWidth = Math.max(rect.width, longestLabel.length * 8 + 60);
        customWidth = Math.min(estimatedWidth, 300); // Cap at 300px
      }
      
      // Calcular posição considerando limites da tela
      let left = rect.left + window.scrollX;
      
      // Se a largura customizada for maior que a largura do botão
      if (customWidth > rect.width) {
        // Alinhar com a borda direita do botão e crescer para a esquerda
        const buttonRight = rect.right + window.scrollX;
        left = buttonRight - customWidth;
        
        // Garantir que não saia pela esquerda
        if (left < 10) {
          left = 10;
        }
      }
      
      // Ensure it doesn't overflow right edge of screen
      if (left + customWidth > window.innerWidth - 10) {
        left = window.innerWidth - customWidth - 10;
      }
      
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: left,
        width: customWidth,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered, dropdownWidth, options, allLabel]);

  // Verificar se todos estão selecionados de forma mais robusta
  const allSelected = options.length > 0 && 
    selectedValues.length === options.length && 
    options.every(opt => selectedValues.includes(opt.value));
  
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
      {options.map((opt, index) => (
        <label key={`${opt.value}-${index}`} className="d-flex align-items-center" style={{ 
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
      height: '100%',
      display: 'flex',
      alignItems: 'center'
    }}>
      <button
        ref={buttonRef}
        type="button"
        className="form-control d-flex align-items-center justify-content-between"
        style={{ 
          cursor: 'pointer', 
          width: '100%', 
          height: variant === 'ghost' ? '30px' : 38, 
          background: variant === 'ghost' ? 'transparent' : 'var(--color-background-primary)', 
          color: 'var(--color-text-primary)', 
          border: variant === 'ghost' ? 'none' : '1px solid var(--color-border-divider)', 
          borderRadius: 8, 
          fontSize: variant === 'ghost' ? 12 : 13, 
          boxShadow: 'none', 
          padding: variant === 'ghost' ? '0 8px' : '0 10px', 
          margin: 0 
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ 
            flex: 1, 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: variant === 'ghost' ? 'space-between' : 'flex-start',
            gap: '8px'
          }}>
            {label && (
              <span style={{ 
                color: variant === 'ghost' ? 'var(--color-text-secondary)' : 'inherit', 
                fontWeight: variant === 'ghost' ? 500 : 'inherit', 
                fontSize: variant === 'ghost' ? '11px' : 'inherit',
                opacity: variant === 'ghost' ? 0.8 : 1
              }}>
                {label}
              </span>
            )}
            <span style={{ 
              fontWeight: variant === 'ghost' ? 600 : 400,
              flex: 1,
              textAlign: variant === 'ghost' ? 'right' : 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: variant === 'ghost' ? '13px' : '13px'
            }}>
              {selectedValues.length === 0 ? allLabel : 
               `${selectedValues.length} ${selectedValues.length === 1 ? 'selected' : 'selected'}`}
            </span>
          </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {/* Pré-renderiza o dropdown invisível ao montar, e visível ao abrir */}
      {hasPreRendered && (
        disablePortal
          ? dropdownJSX
          : createPortal(dropdownJSX, document.body)
      )}
    </div>
  );
};

export default MultiSelectDropdown; 