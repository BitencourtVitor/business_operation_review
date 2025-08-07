import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SingleSelectDropdownProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  dropdownTitle?: string;
  disablePortal?: boolean;
  dropdownWidth?: number;
}

const SingleSelectDropdown: React.FC<SingleSelectDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Selecionar',
  label,
  dropdownTitle,
  disablePortal = false,
  dropdownWidth
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
      const customWidth = dropdownWidth || rect.width;
      
      // Calcular posição considerando limites da tela
      let left = rect.left + window.scrollX;
      const viewportWidth = window.innerWidth;
      
      // Se a largura customizada for maior que a largura do botão
      if (customWidth > rect.width) {
        // Alinhar com a borda direita do botão e crescer para a esquerda
        const buttonRight = rect.right + window.scrollX;
        left = buttonRight - customWidth;
        
        // Garantir que não saia pela esquerda
        if (left < 0) {
          left = 0;
        }
      }
      
      // Garantir que não saia pela esquerda
      if (left < 0) {
        left = 0;
      }
      
      setDropdownPos({
        top: rect.bottom + window.scrollY,
        left: left,
        width: customWidth,
      });
      if (!hasPreRendered) setHasPreRendered(true);
    }
  }, [open, hasPreRendered, dropdownWidth]);

  const selectedOption = options.find(opt => opt.value === value);

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
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          style={{ 
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            padding: '8px 12px',
            fontSize: 14,
            color: opt.value === value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontWeight: opt.value === value ? 500 : 400,
            background: opt.value === value ? 'var(--color-background-secondary)' : 'transparent'
          }}
          onClick={() => {
            onChange(opt.value);
            setOpen(false);
          }}
        >
          {opt.label}
        </button>
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
      {label && (
        <div style={{ 
          fontSize: 12, 
          color: 'var(--color-text-secondary)', 
          marginBottom: 4,
          fontWeight: 500
        }}>
          {label}
        </div>
      )}
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
          {selectedOption ? selectedOption.label : placeholder}
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

export default SingleSelectDropdown; 