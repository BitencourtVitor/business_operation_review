import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TimesheetRow } from '../../types/timesheet';
import CloseButton from '../../utils/CloseButton';
import { addCurrentMonthNameIfMissing } from '../../utils/dataUtils';

interface TimesheetTableModalProps {
  show: boolean;
  onClose: () => void;
  data: TimesheetRow[];
  years?: string[];
}

const TimesheetTableModal: React.FC<TimesheetTableModalProps> = ({ show, onClose, data, years = [] }) => {
  // Todas as colunas disponíveis
  const allColumns = useMemo(() => [
    { value: 'date', label: 'Date' },
    { value: 'nome', label: 'Name' },
    { value: 'error', label: 'Error' },
    { value: 'team', label: 'Team' },
    { value: 'corporation', label: 'Corporation' },
    { value: 'payrate', label: 'Pay Rate' },
    { value: 'add_time_hour', label: 'Add Time' },
    { value: 'remove_time_hour', label: 'Remove Time' },
    { value: 'add_dollar', label: 'Added Value' },
    { value: 'remove_dollar', label: 'Removed Value' },
    { value: 'total', label: 'Total' }
  ], []);

  // Estados para ordenação da tabela
  const [sortBy, setSortBy] = React.useState<typeof allColumns[number]['value']>('total');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  
  // Estados para filtros de data - 2025 como padrão
  const [selectedYear, setSelectedYear] = React.useState<string>('2025');
  const [selectedMonth, setSelectedMonth] = React.useState<string>('');
  
  // Estado para colunas visíveis - inicializa com todas as colunas
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  
  // Estado para dropdown de colunas
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Mapeia meses disponíveis baseado no ano selecionado
  const availableMonths = useMemo(() => {
    if (!selectedYear) return [];
    
    const yearData = data.filter(row => {
      const rowYear = new Date(row.date).getFullYear().toString();
      return rowYear === selectedYear;
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const monthsInYear = new Set<string>();
    yearData.forEach(row => {
      const rowDate = new Date(row.date);
      const monthName = monthNames[rowDate.getMonth()];
      monthsInYear.add(monthName);
    });

    // Adicionar mês atual se for o ano selecionado
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear().toString();
    if (currentYear === selectedYear) {
      const currentMonthName = monthNames[currentDate.getMonth()];
      monthsInYear.add(currentMonthName);
    }

    return Array.from(monthsInYear).sort((a, b) => {
      return monthNames.indexOf(a) - monthNames.indexOf(b);
    });
  }, [data, selectedYear]);

  // Inicializa as colunas visíveis quando o modal é aberto
  React.useEffect(() => {
    if (show) {
      const columns = allColumns.map(col => col.value);
      setVisibleColumns(columns);
    }
  }, [show, allColumns]);

  // Fecha dropdown quando clica fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setShowColumnDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleColumn = (columnValue: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(columnValue)) {
        return prev.filter(col => col !== columnValue);
      } else {
        return [...prev, columnValue];
      }
    });
  };

  const toggleAllColumns = (show: boolean) => {
    if (show) {
      setVisibleColumns(allColumns.map(col => col.value));
    } else {
      setVisibleColumns([]);
    }
  };

  // Aplica filtros e ordenação aos dados
  const filteredAndSortedData = useMemo(() => {
    let filteredData = [...data];

    // Filtro por ano
    if (selectedYear) {
      filteredData = filteredData.filter(row => {
        const rowYear = new Date(row.date).getFullYear().toString();
        return rowYear === selectedYear;
      });
    }

    // Filtro por mês
    if (selectedMonth) {
      filteredData = filteredData.filter(row => {
        const rowDate = new Date(row.date);
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const rowMonth = monthNames[rowDate.getMonth()];
        return rowMonth === selectedMonth;
      });
    }

    // Ordenação
    filteredData.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'total':
          aValue = parseFloat(a.total) || 0;
          bValue = parseFloat(b.total) || 0;
          break;
        case 'hours':
          aValue = parseFloat(a.add_time_hour) || 0;
          bValue = parseFloat(b.add_time_hour) || 0;
          break;
        case 'name':
          aValue = a.nome.toLowerCase();
          bValue = b.nome.toLowerCase();
          break;
        case 'removed':
          aValue = parseFloat(a.remove_dollar) || 0;
          bValue = parseFloat(b.remove_dollar) || 0;
          break;
        default:
          aValue = a.nome.toLowerCase();
          bValue = b.nome.toLowerCase();
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (sortDir === 'asc') {
          return aValue.localeCompare(bValue);
        } else {
          return bValue.localeCompare(aValue);
        }
      } else {
        if (sortDir === 'asc') {
          return (aValue as number) - (bValue as number);
        } else {
          return (bValue as number) - (aValue as number);
        }
      }
    });

    return filteredData;
  }, [data, selectedYear, selectedMonth, sortBy, sortDir]);

  const handleClose = () => {
    onClose();
  };

  if (!show) return null;

  const portalContainer = typeof document !== 'undefined' ? document.body : null;
  if (!portalContainer) return null;

  // Antes do return, defina as opções de ordenação baseadas nas colunas visíveis:
  const sortableColumns = allColumns.filter(col => visibleColumns.includes(col.value));

  return createPortal(
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={handleClose}
    >
      <div 
        style={{ 
          background: 'var(--color-background-primary)',
          borderRadius: 10,
          maxWidth: '95%',
          width: '1200px',
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ border: '1px solid var(--color-border-divider)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 24, fontWeight: 400 }}>Timesheet</span>
              <span style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, margin: 0 }}>Data Overview</span>
            </div>
            <CloseButton onClick={handleClose} size="md" />
          </div>
          
          <div style={{ padding: '24px', background: 'var(--color-background-primary)', height: 'calc(90vh - 120px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }} className='justify-content-end'>
              <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
                {/* Controle de data */}
                <div className="input-group" style={{ minWidth: 193, maxWidth: 193, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'hidden', height: 38 }}>
                  <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 38, width: 42, padding: 0 }}>
                    <i className="bi bi-calendar-range" style={{ color: 'var(--color-accent-primary)', fontSize: 16 }} />
                  </span>
                  <select id="year-select" name="year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', borderRadius: 0, height: 38, width: 70, fontSize: 14 }}>
                    {years?.map(y => <option key={y} value={y}>{y}</option>) || []}
                  </select>
                  <select id="month-select" name="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 0, height: 38, width: 75, fontSize: 14 }}>
                    <option value="">Todos</option>
                    {addCurrentMonthNameIfMissing(availableMonths, selectedYear).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 40 }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof allColumns[number]['value'])}
                      style={{
                        background: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        border: '1.5px solid var(--color-border-divider)',
                        borderRadius: 8,
                        padding: '4px 32px 4px 8px',
                        fontSize: 14,
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        minWidth: 110,
                        height: 28,
                        textAlign: 'start',
                      }}>
                      {sortableColumns.map(col => (
                        <option key={col.value} value={col.value}>{col.label}</option>
                      ))}
                    </select>
                    <i
                      className="bi bi-chevron-down"
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        color: 'var(--color-accent-primary)',
                        fontSize: 16,
                      }}
                    />
                  </div>
                  <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={{ background: 'var(--color-background-primary)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', height: 26 }}>
                    {(() => {
                      // Colunas consideradas texto
                      const textCols = ['name', 'team', 'corporation', 'error', 'nome', 'date'];
                      if (textCols.includes(sortBy)) {
                        return sortDir === 'asc' ? <i className="bi bi-sort-alpha-down" /> : <i className="bi bi-sort-alpha-up" />;
                      } else {
                        return sortDir === 'asc' ? <i className="bi bi-sort-numeric-down" /> : <i className="bi bi-sort-numeric-up" />;
                      }
                    })()}
                  </button>
                </div>
                
                {/* Controle de colunas visíveis - Dropdown customizado com checklist */}
                <div className="input-group" style={{ minWidth: 200, maxWidth: 200, background: 'var(--color-background-primary)', borderRadius: 8, border: '1.5px solid var(--color-border-divider)', overflow: 'visible', height: 38, zIndex: 20, display: 'flex', position: 'relative', boxSizing: 'border-box' }} ref={columnDropdownRef}>
                  <span className="input-group-text d-flex align-items-center justify-content-center" style={{ background: 'var(--color-background-secondary)', border: 'none', borderRight: '1.5px solid var(--color-border-divider)', height: 36, width: 42, padding: 0, color: 'var(--color-accent-primary)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0, boxSizing: 'border-box' }}>
                    <i className="bi bi-columns" style={{ fontSize: 17 }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, zIndex: 21, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 36, position: 'relative', boxSizing: 'border-box' }}>
                    <button
                      ref={buttonRef}
                      type="button"
                      className="form-control d-flex align-items-center justify-content-between"
                      style={{ 
                        cursor: 'pointer', 
                        width: '100%', 
                        height: 36, 
                        background: 'var(--color-background-primary)', 
                        color: 'var(--color-text-primary)', 
                        border: 'none', 
                        borderTopRightRadius: 8,
                        borderBottomRightRadius: 8,
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        fontSize: 14, 
                        boxShadow: 'none', 
                        padding: '0 12px', 
                        margin: 0,
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                      onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                    >
                      <span style={{ 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        textAlign: 'left',
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                        {visibleColumns.length === 0
                          ? 'Colunas'
                          : visibleColumns.length === allColumns.length
                            ? 'Todas'
                            : `${visibleColumns.length} selecionadas`}
                      </span>
                      <i className={`bi ${showColumnDropdown ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ marginLeft: 8, height: 36, display: 'flex', alignItems: 'center' }} />
                    </button>
                    
                    {showColumnDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        border: '1.5px solid var(--color-border-divider)',
                        borderRadius: 6,
                        minWidth: 0,
                        maxHeight: 220,
                        overflowY: 'auto',
                        padding: 0,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        fontSize: 14,
                        zIndex: 1000
                      }}
                      className="custom-scrollbar"
                      >
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
                          Columns
                        </div>
                        <div style={{ padding: 0, borderBottom: '1px solid var(--color-border-divider)' }}>
                          <label className="d-flex align-items-center" style={{ 
                            gap: 8, 
                            fontSize: 14, 
                            color: 'var(--color-text-secondary)', 
                            cursor: 'pointer', 
                            padding: '6px 12px',
                            height: 36,
                            alignItems: 'center',
                          }}>
                            <input 
                              type="checkbox" 
                              checked={visibleColumns.length === allColumns.length} 
                              onChange={() => toggleAllColumns(visibleColumns.length !== allColumns.length)} 
                              style={{ accentColor: 'var(--color-accent-primary)', margin: 0, height: 16, width: 16 }} 
                            />
                            <span style={{ height: 36, display: 'flex', alignItems: 'center' }}>Todas</span>
                          </label>
                        </div>
                        {allColumns.map((column) => (
                          <label key={column.value} className="d-flex align-items-center" style={{ 
                            gap: 8, 
                            fontSize: 14, 
                            color: 'var(--color-text-secondary)', 
                            cursor: 'pointer', 
                            padding: '6px 12px',
                            height: 36,
                            alignItems: 'center',
                          }}>
                            <input 
                              type="checkbox" 
                              checked={visibleColumns.includes(column.value)} 
                              onChange={() => toggleColumn(column.value)} 
                              style={{ accentColor: 'var(--color-accent-primary)', margin: 0, height: 16, width: 16 }} 
                            />
                            <span style={{ height: 36, display: 'flex', alignItems: 'center' }}>{column.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flex: '1 1 0%', height: 0, overflowY: 'auto', width: '100%' }} className="custom-scrollbar">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-background-secondary)' }}>
                      {allColumns.map(column => (
                        visibleColumns.includes(column.value) && (
                          <th key={column.value} style={{ 
                            padding: 12, 
                            border: '1px solid var(--color-border-divider)', 
                            color: 'var(--color-text-primary)', 
                            textAlign: column.value.includes('dollar') || column.value === 'payrate' || column.value === 'total' || column.value.includes('hour') ? 'right' : 'left', 
                            position: 'sticky', 
                            top: 0, 
                            background: 'var(--color-background-secondary)', 
                            zIndex: 2 
                          }}>
                            {column.label}
                          </th>
                        )
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedData.map((row, index) => (
                      <tr key={index}>
                        {allColumns.map(column => (
                          visibleColumns.includes(column.value) && (
                            <td key={column.value} style={{ 
                              padding: 12, 
                              border: '1px solid var(--color-border-divider)', 
                              color: column.value === 'add_dollar' ? '#1bbf5c' : 
                                    column.value === 'remove_dollar' ? '#dc3545' : 
                                    column.value === 'total' ? '#007bff' : 'var(--color-text-secondary)', 
                              textAlign: column.value.includes('dollar') || column.value === 'payrate' || column.value === 'total' || column.value.includes('hour') ? 'right' : 'left' 
                            }}>
                              {column.value.includes('dollar') || column.value === 'payrate' || column.value === 'total' ? 
                                (isNaN(parseFloat(row[column.value as keyof TimesheetRow] as string)) ? '-' : 
                                 parseFloat(row[column.value as keyof TimesheetRow] as string).toLocaleString('en-US', { 
                                   style: 'currency', 
                                   currency: 'USD' 
                                 })) :
                                column.value.includes('hour') ? 
                                  (isNaN(parseFloat(row[column.value as keyof TimesheetRow] as string)) ? '-' : 
                                   parseFloat(row[column.value as keyof TimesheetRow] as string).toFixed(2)) :
                                row[column.value as keyof TimesheetRow] as string
                              }
                            </td>
                          )
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    portalContainer
  );
};

export default TimesheetTableModal; 