import React, { useState, useMemo } from 'react';
import type { OFIData } from '../../../hooks/useOFIData';

interface OFITableProps {
  data: OFIData[];
}

type SortConfig = {
  key: keyof OFIData | 'project_name';
  direction: 'asc' | 'desc';
} | null;

export default function OFITable({ data }: OFITableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'total_score', direction: 'desc' });

  const handleSort = (key: keyof OFIData | 'project_name') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      let aValue: any = sortConfig.key === 'project_name' ? (a.project_name || a.obra_id || '') : a[sortConfig.key as keyof OFIData];
      let bValue: any = sortConfig.key === 'project_name' ? (b.project_name || b.obra_id || '') : b[sortConfig.key as keyof OFIData];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <i className="bi bi-arrow-down-up ms-2" style={{ fontSize: '10px', opacity: 0.3 }} />;
    }
    return sortConfig.direction === 'asc' 
      ? <i className="bi bi-arrow-up ms-2" style={{ fontSize: '12px', color: 'var(--color-accent-primary)' }} />
      : <i className="bi bi-arrow-down ms-2" style={{ fontSize: '12px', color: 'var(--color-accent-primary)' }} />;
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    borderBottom: '1.5px solid var(--color-border-divider)',
    background: 'var(--color-background-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  };

  return (
    <div className="mx-4 mb-4">
      <div className="border-0 p-0" style={{ background: 'var(--color-background-primary)' }}>
        <h4 className='my-2 d-flex justify-content-start align-items-center' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, minHeight: 30 }}>
          Project Detailing
        </h4>
      </div>
      <div style={{ 
        background: 'var(--color-background-primary)',
        border: '1px solid var(--color-border-divider)',
        borderRadius: 0,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div className="table-responsive custom-scrollbar" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="table table-hover mb-0" style={{ color: 'var(--color-text-primary)', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 1 }}>
            <tr>
              <th style={headerStyle} onClick={() => handleSort('project_name')}>
                PROJECT NAME <SortIcon columnKey="project_name" />
              </th>
              <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('total_score')}>
                TOTAL SCORE <SortIcon columnKey="total_score" />
              </th>
              <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('fieldwire_score')}>
                FIELDWIRE <SortIcon columnKey="fieldwire_score" />
              </th>
              <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('machines_score')}>
                MACHINES <SortIcon columnKey="machines_score" />
              </th>
              <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('contract_score')}>
                CONTRACT <SortIcon columnKey="contract_score" />
              </th>
              <th style={{ ...headerStyle, textAlign: 'center' }} onClick={() => handleSort('systems_score')}>
                SYSTEMS <SortIcon columnKey="systems_score" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-5" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-background-primary)' }}>
                  No data found for selected filters.
                </td>
              </tr>
            ) : (
              sortedData.map((item) => (
                <tr key={item.id} style={{ transition: 'background-color 0.2s ease' }}>
                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.project_name || item.obra_id || 'N/A'}</div>
                  </td>
                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: 4, 
                      fontSize: 13, 
                      fontWeight: 600,
                      background: 'var(--color-background-secondary)',
                      color: 'var(--color-accent-primary)',
                      border: '1px solid var(--color-border-divider)'
                    }}>
                      {item.total_score.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                    <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>
                      {item.fieldwire_score.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                    <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>
                      {item.machines_score.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                    <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>
                      {item.contract_score.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 24px', verticalAlign: 'middle', textAlign: 'center', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
                    <span style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>
                      {item.systems_score.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}
