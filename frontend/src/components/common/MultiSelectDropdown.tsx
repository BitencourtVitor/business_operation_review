import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MultiSelectDropdownProps {
  options: ({ value: string; label: string } | string)[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
  dropdownTitle?: string;
  disablePortal?: boolean;
  dropdownWidth?: number;
  variant?: 'default' | 'ghost';
  label?: string;
  isSingleSelect?: boolean;
  style?: React.CSSProperties;
  allowCustomValue?: boolean;
  placeholder?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  options = [],
  selectedValues = [],
  onChange,
  allLabel = 'Todos',
  dropdownTitle,
  disablePortal = false,
  dropdownWidth,
  variant = 'default',
  label,
  isSingleSelect = false,
  style,
  allowCustomValue = false,
  placeholder
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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
        const longestLabel = options.reduce<string>((longest, opt) => {
          const currentLabel = typeof opt === 'string' ? opt : opt.label;
          return currentLabel.length > longest.length ? currentLabel : longest;
        }, allLabel);
        // Rough estimation: 8px per character + padding + checkbox space
        const estimatedWidth = Math.max(rect.width, longestLabel.length * 8 + 60);
        customWidth = Math.min(estimatedWidth, 500); // Cap at 500px instead of 300px
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
    options.every(opt => {
      const value = typeof opt === 'string' ? opt : opt.value;
      return selectedValues.includes(value);
    });
  
  const toggleOption = (optValue: string) => {
    if (selectedValues.includes(optValue)) {
      onChange(selectedValues.filter(o => o !== optValue));
    } else {
      onChange([...selectedValues, optValue]);
    }
  };
  
  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map(opt => typeof opt === 'string' ? opt : opt.value));
    }
  };

  // Filter options based on search term
  const filteredOptions = options.filter(opt => {
    const labelText = typeof opt === 'string' ? opt : opt.label;
    return labelText.toLowerCase().includes(searchTerm.toLowerCase());
  });

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
        maxHeight: 280,
        overflow: 'hidden', // Contain the sticky header
        padding: 0,
        boxShadow: 'none',
        fontSize: 14,
        display: open ? 'flex' : 'none',
        flexDirection: 'column'
      }}
    >
      {/* Fixed Header: Title and Search */}
      <div style={{ 
        flexShrink: 0,
        background: 'var(--color-background-secondary)',
        borderBottom: '1px solid var(--color-border-divider)',
        padding: '8px 12px'
      }}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          {dropdownTitle && (
             <div style={{ 
               fontWeight: 600, 
               fontSize: 12, 
               color: 'var(--color-accent-primary)', 
               letterSpacing: '0.2px',
               margin: 0
             }}>
               {dropdownTitle}
             </div>
           )}
           <button
             onClick={(e) => {
               if (selectedValues.length === 0) return;
               e.stopPropagation();
               onChange([]);
             }}
             title="Limpar todos os filtros"
             disabled={selectedValues.length === 0}
             style={{
               background: 'none',
               border: 'none',
               padding: 0,
               width: '24px',
               height: '24px',
               fontSize: 14,
               color: selectedValues.length > 0 ? '#ef4444' : 'var(--color-text-secondary)',
               cursor: selectedValues.length > 0 ? 'pointer' : 'default',
               borderRadius: 4,
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               opacity: selectedValues.length > 0 ? 1 : 0.4,
               transition: 'all 0.2s ease'
             }}
             onMouseEnter={(e) => {
               if (selectedValues.length > 0) {
                 e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
               }
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.background = 'none';
             }}
           >
              <i className="bi bi-eraser" />
            </button>
         </div>
        <div style={{ position: 'relative' }}>
          <i className="bi bi-search" style={{ 
            position: 'absolute', 
            left: 8, 
            top: '50%', 
            transform: 'translateY(-50%)', 
            fontSize: 12, 
            color: 'var(--color-text-secondary)',
            opacity: 0.6
          }} />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'var(--color-background-primary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: 4,
              padding: '4px 28px 4px 28px',
              fontSize: 12,
              color: 'var(--color-text-primary)',
              outline: 'none'
            }}
          />
          {searchTerm && (
            <i 
              className="bi bi-x-lg" 
              onClick={(e) => {
                e.stopPropagation();
                setSearchTerm('');
              }}
              style={{ 
                position: 'absolute', 
                right: 8, 
                top: '50%', 
                transform: 'translateY(-50%)', 
                fontSize: 12, 
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                opacity: 0.8,
                padding: '4px'
              }} 
            />
          )}
        </div>
      </div>

      {/* Scrollable List */}
      <div 
        className="custom-scrollbar"
        style={{ 
          overflowY: 'auto',
          flexGrow: 1,
          maxHeight: 200
        }}
      >
        {!isSingleSelect && searchTerm === '' && (
          <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
            <label className="d-flex align-items-center" style={{ 
              gap: 8, 
              fontSize: 13, 
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
              <span style={{ fontWeight: 500 }}>{allLabel}</span>
            </label>
          </div>
        )}

        {allowCustomValue && searchTerm && !options.some(opt => (typeof opt === 'string' ? opt : opt.label || '').toLowerCase() === searchTerm.toLowerCase()) && (
             <div 
               className="d-flex align-items-center"
               style={{
                 padding: '8px 12px',
                 cursor: 'pointer',
                 color: 'var(--color-accent-primary)',
                 borderBottom: filteredOptions.length > 0 ? '1px solid var(--color-border-divider)' : 'none',
                 transition: 'background-color 0.2s ease'
               }}
               onClick={() => {
                  onChange([searchTerm]);
                  setOpen(false);
                  setSearchTerm('');
               }}
               onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)'}
               onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
             >
               <i className="bi bi-plus-circle" style={{ marginRight: 8 }}></i>
               Create "{searchTerm}"
             </div>
        )}
        
        {filteredOptions.length === 0 ? (
          (!allowCustomValue || !searchTerm) && (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>
              No results found
            </div>
          )
        ) : (
          filteredOptions.map((opt, index) => {
            const value = typeof opt === 'string' ? opt : opt.value;
            const labelText = typeof opt === 'string' ? opt : opt.label;
            const isSelected = selectedValues.includes(value);

            return (
              <label 
                key={`${value}-${index}`} 
                className="d-flex align-items-start" 
                style={{ 
                  gap: 8, 
                  fontSize: 13, 
                  color: isSelected && isSingleSelect ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', 
                  cursor: 'pointer', 
                  padding: '8px 12px',
                  background: isSelected && isSingleSelect ? 'var(--color-background-secondary)' : 'transparent',
                  transition: 'all 0.2s ease'
                }}
                onClick={(e) => {
                  if (isSingleSelect) {
                    e.preventDefault();
                    onChange([value]);
                    setOpen(false);
                    setSearchTerm('');
                  }
                }}
              >
                {!isSingleSelect && (
                  <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={() => toggleOption(value)} 
                    style={{ accentColor: 'var(--color-accent-primary)', margin: '3px 0 0 0' }} 
                  />
                )}
                <span style={{ 
                  flex: 1,
                  minWidth: 0,
                  fontWeight: isSelected && isSingleSelect ? 600 : 400,
                  wordBreak: 'break-word',
                  whiteSpace: 'normal',
                  lineHeight: '1.4'
                }}>
                  {labelText}
                </span>
              </label>
            );
          })
        )}
      </div>
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
          border: variant === 'ghost' ? 'none' : 'none', 
          borderRadius: 4,
          fontSize: variant === 'ghost' ? 12 : 13,
          boxShadow: 'none',
          padding: variant === 'ghost' ? '0 8px' : '0 10px',
          margin: 0,
          ...style // Apply custom styles
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
            {isSingleSelect ? (
              <span style={{ 
                color: 'var(--color-text-primary)', 
                fontWeight: style?.fontWeight || 400,
                fontSize: variant === 'ghost' ? '12px' : '13px'
              }}>
                {(() => {
                  const selectedOpt = options.find(opt => (typeof opt === 'string' ? opt : opt.value) === selectedValues[0]);
                  return selectedOpt ? (typeof selectedOpt === 'string' ? selectedOpt : selectedOpt.label) : (placeholder || allLabel);
                })()}
              </span>
            ) : (
              <>
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
                  color: selectedValues.length > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                  fontWeight: selectedValues.length > 0 ? 600 : 400
                }}>
                  {selectedValues.length === 0 ? (placeholder || allLabel) : 
                   selectedValues.length === options.length ? 'Todos' : 
                   `${selectedValues.length} selecionado${selectedValues.length > 1 ? 's' : ''}`}
                </span>
              </>
            )}
        </span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, opacity: 0.7 }} />
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