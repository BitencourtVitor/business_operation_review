import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SingleSelectDropdownProps {
  options: { value: string; label: string }[];
  selectedValue: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  dropdownTitle?: string;
  disablePortal?: boolean;
  dropdownWidth?: number;
  variant?: 'default' | 'ghost';
  label?: string;
}

const SingleSelectDropdown: React.FC<SingleSelectDropdownProps> = ({
  options,
  selectedValue,
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
        // Rough estimation: 8px per character + padding
        const estimatedWidth = Math.max(rect.width, longestLabel.length * 8 + 40);
        customWidth = Math.min(estimatedWidth, 300); // Cap at 300px
      }
      
      let left = rect.left + window.scrollX;
      
      if (customWidth > rect.width) {
        // Align with right edge of button if dropdown is wider
        left = (rect.right + window.scrollX) - customWidth;
        if (left < 10) left = 10; // Keep some margin from left edge
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

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === selectedValue);

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
      <div 
        onClick={() => handleSelect('')}
        style={{ 
          padding: '8px 12px', 
          cursor: 'pointer',
          background: selectedValue === '' ? 'rgba(var(--color-accent-primary-rgb, 37, 99, 235), 0.08)' : 'transparent',
          color: selectedValue === '' ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
          fontWeight: selectedValue === '' ? 600 : 400,
          borderBottom: '1px solid var(--color-border-divider)'
        }}
      >
        {allLabel}
      </div>
      {options.map((opt, index) => (
        <div 
          key={`${opt.value}-${index}`}
          onClick={() => handleSelect(opt.value)}
          style={{ 
            padding: '8px 12px', 
            cursor: 'pointer',
            background: selectedValue === opt.value ? 'rgba(var(--color-accent-primary-rgb, 37, 99, 235), 0.08)' : 'transparent',
            color: selectedValue === opt.value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
            fontWeight: selectedValue === opt.value ? 600 : 400,
            transition: 'all 0.2s'
          }}
        >
          {opt.label}
        </div>
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
          padding: variant === 'ghost' ? '0 5px' : '0 10px', 
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
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
              {selectedValue === '' ? allLabel : (selectedOption?.label || placeholder)}
            </span>
          </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8, fontSize: '12px' }} />
      </button>
      {hasPreRendered && (
        disablePortal
          ? dropdownJSX
          : createPortal(dropdownJSX, document.body)
      )}
    </div>
  );
};

export default SingleSelectDropdown;