import React, { useMemo, useState, useRef } from 'react';
import type { TimesheetRow } from '../../../types/timesheet';
import TimesheetTableModal from '../../modals/TimesheetTableModal';

interface TimesheetTableProps {
  filteredData: TimesheetRow[];
  years?: string[];
  financialPass: boolean;
}

export default function TimesheetTable({ filteredData, years = [], financialPass }: TimesheetTableProps) {
  // Estados para agrupamento e ordenação da tabela
  const [groupBy, setGroupBy] = React.useState<'team' | 'error'>('team');
  const [sortBy, setSortBy] = React.useState<'total' | 'hours' | 'name' | 'removed'>('total');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [showModal, setShowModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dados agrupados para a tabela
  const groupedData = useMemo(() => {
    const key = groupBy;
    const groups: Record<string, { count: number; add: number; rem: number }> = {};
    filteredData.forEach(row => {
      const groupValue = row[key] || 'N/A';
      if (!groups[groupValue]) {
        groups[groupValue] = { count: 0, add: 0, rem: 0 };
      }
      groups[groupValue].count++;
      groups[groupValue].add += parseFloat(row.add_dollar) || 0;
      groups[groupValue].rem += parseFloat(row.remove_dollar) || 0;
    });
    // Ordenação
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      let vA, vB;
      if (sortBy === 'total') {
        vA = a[0];
        vB = b[0];
        if (!isNaN(Number(vA)) && !isNaN(Number(vB))) {
          vA = Number(vA);
          vB = Number(vB);
        }
      } else if (sortBy === 'hours') {
        vA = a[1].count;
        vB = b[1].count;
      } else if (sortBy === 'name') {
        vA = a[1].add;
        vB = b[1].add;
      } else { // removed
        vA = a[1].rem;
        vB = b[1].rem;
      }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return Object.fromEntries(entries);
  }, [filteredData, groupBy, sortBy, sortDir]);

  // Função para abrir o campo de busca e focar
  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Função para fechar o campo de busca
  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchText('');
  };

  // Filtrar os dados agrupados conforme o texto
  const filteredGroupedData = useMemo(() => {
    if (!searchText.trim()) return groupedData;
    const lower = searchText.toLowerCase();
    return Object.fromEntries(
      Object.entries(groupedData).filter(([key]) => key.toLowerCase().includes(lower))
    );
  }, [groupedData, searchText]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
            Data Overview
          </h4>
          <button 
            onClick={() => setShowModal(true)}
            className="btn-tertiary-custom d-flex align-items-center justify-content-center"
            style={{ 
              marginLeft: 5,
              width: 28,
              height: 28,
              fontSize: 14,
              padding: 0,
              borderRadius: 14,
              transition: 'all 0.2s ease',
            }}
            title="Expandir tabela"
          >
            <i className="bi bi-arrows-angle-expand d-flex align-items-center justify-content-center" />
          </button>
        </div>
        <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Filtro de texto */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: searchOpen ? 'space-between' : 'center',
              position: 'relative',
              width: searchOpen ? 220 : 42,
              height: 42,
              transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
              background: searchOpen ? 'var(--color-background-secondary)' : 'var(--color-background-secondary)',
              border: '1px solid var(--color-border-divider)',
              borderRadius: searchOpen ? 25 : 21,
              padding: searchOpen ? '2px 8px 2px 8px' : '4px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              className="btn-tertiary-custom d-flex align-items-center justify-content-center"
              style={{ width: 28, height: 28, fontSize: 16, borderRadius: 14, transition: 'all 0.2s', color: 'var(--color-accent-primary)', flexShrink: 0, background: 'transparent', border: 'none' }}
              onClick={handleOpenSearch}
              aria-label="Abrir busca"
              title="Buscar"
              tabIndex={searchOpen ? -1 : 0}
              disabled={searchOpen}
            >
              <i className="bi bi-search" />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={groupBy === 'team' ? 'Buscar time...' : 'Buscar erro...'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontSize: 15,
                height: 32,
                marginLeft: 4,
                display: searchOpen ? 'block' : 'none',
                padding: searchOpen ? '0 8px 0 4px' : '0',
                width: searchOpen ? '100%' : 0,
                minWidth: 0,
                opacity: searchOpen ? 1 : 0,
                pointerEvents: searchOpen ? 'auto' : 'none',
                transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onBlur={() => { if (!searchText) handleCloseSearch(); }}
              tabIndex={searchOpen ? 0 : -1}
            />
          </div>
          <div style={{ height: 42, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }} className='justify-content-between'>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Group by</span>
            <button onClick={() => setGroupBy('team')} style={{ background: groupBy === 'team' ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', color: groupBy === 'team' ? '#fff' : 'var(--color-accent-primary)', border: '1.5px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 16px', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>Teams</button>
            <button onClick={() => setGroupBy('error')} style={{ background: groupBy === 'error' ? 'var(--color-accent-primary)' : 'var(--color-background-secondary)', color: groupBy === 'error' ? '#fff' : 'var(--color-accent-primary)', border: '1.5px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 16px', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>Errors</button>
          </div>
          {/* Ordenação */}
          <div style={{ height: 42, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as 'total' | 'hours' | 'name' | 'removed')}
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
                }}>
                <option value="total">{groupBy === 'team' ? 'Team' : 'Error'}</option>
                <option value="hours">Error Count</option>
                {financialPass && <option value="name">Added Value</option>}
                {financialPass && <option value="removed">Removed Value</option>}
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
            <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={{ background: 'var(--color-background-primary)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              {sortDir === 'asc' ? (
                sortBy === 'total' ? <i className="bi bi-sort-alpha-down" /> : <i className="bi bi-sort-numeric-down" />
              ) : (
                sortBy === 'total' ? <i className="bi bi-sort-alpha-up" /> : <i className="bi bi-sort-numeric-up" />
              )}
            </button>
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '40vh', padding: '0 10px 10px 10px' }}>
        <div style={{ flex: '1 1 0%', height: 0, overflowY: 'auto', width: '100%' }} className="custom-scrollbar">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--color-background-secondary)' }}>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>{groupBy === 'team' ? 'Team' : 'Error'}</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Error Count</th>
                {financialPass && <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Added Value</th>}
                {financialPass && <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Removed Value</th>}
              </tr>
            </thead>
            <tbody>
              {Object.entries(filteredGroupedData).map(([key, val]) => (
                <tr key={key}>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{key}</td>
                  <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>{val.count}</td>
                  {financialPass && <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#1bbf5c', textAlign: 'right' }}>{val.add.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>}
                  {financialPass && <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: '#dc3545', textAlign: 'right' }}>{val.rem.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <TimesheetTableModal 
        show={showModal}
        onClose={() => setShowModal(false)}
        data={filteredData}
        years={years}
        financialPass={financialPass}
      />
    </>
  );
} 