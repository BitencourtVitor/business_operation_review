import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DayDropdownProps {
  selectedDay: string;
  onDayChange: (day: string) => void;
  availableDays: string[];
}

/**
 * Componente DayDropdown para seleção de dias disponíveis
 */
export function DayDropdown({ 
  selectedDay, 
  onDayChange,
  availableDays
}: DayDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
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

  const getDisplayText = () => {
    if (!selectedDay) {
      return 'All';
    }
    return `Day ${selectedDay}`;
  };

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
      <div
        style={{
          padding: '6px 12px',
          fontSize: 14,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          background: !selectedDay ? 'var(--color-background-secondary)' : 'transparent',
          borderBottom: '1px solid var(--color-border-divider)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDayChange('');
          setOpen(false);
        }}
        onMouseEnter={(e) => {
          if (selectedDay) {
            e.currentTarget.style.background = 'var(--color-background-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = !selectedDay ? 'var(--color-background-secondary)' : 'transparent';
        }}
      >
        <i className="bi bi-calendar-check" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
        All
      </div>
      {availableDays.map(day => (
        <div
          key={day}
          style={{
            padding: '6px 12px',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            background: selectedDay === day ? 'var(--color-background-secondary)' : 'transparent',
            borderBottom: '1px solid var(--color-border-divider)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDayChange(day);
            setOpen(false);
          }}
          onMouseEnter={(e) => {
            if (selectedDay !== day) {
              e.currentTarget.style.background = 'var(--color-background-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = selectedDay === day ? 'var(--color-background-secondary)' : 'transparent';
          }}
        >
          <i className="bi bi-calendar-day" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} />
          Day {day}
        </div>
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
          {getDisplayText()}
        </span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8 }} />
      </button>
      {hasPreRendered && createPortal(dropdownJSX, document.body)}
    </div>
  );
} 