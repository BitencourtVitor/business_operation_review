import React, { useMemo } from 'react';
import type { PermitRow } from '../../../types/permit';

interface PermitTableProps {
  filteredData: PermitRow[];
}

export default function PermitTable({ filteredData }: PermitTableProps) {
  // Estados para ordenação da tabela
  const [sortBy, setSortBy] = React.useState<'emissao' | 'situacao' | 'model' | 'jobsite' | 'solicitacao' | 'aplicacao'>('emissao');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');

  // Dados ordenados para a tabela
  const sortedData = useMemo(() => {
    const sorted = [...filteredData].sort((a, b) => {
      let vA, vB;
      
      if (sortBy === 'emissao') {
        vA = a.emissao || '';
        vB = b.emissao || '';
      } else if (sortBy === 'situacao') {
        vA = a.situacao || '';
        vB = b.situacao || '';
      } else if (sortBy === 'model') {
        vA = a.model || '';
        vB = b.model || '';
      } else if (sortBy === 'jobsite') {
        vA = a.jobsite || '';
        vB = b.jobsite || '';
      } else if (sortBy === 'solicitacao') {
        vA = a.solicitacao || '';
        vB = b.solicitacao || '';
      } else { // aplicacao
        vA = a.aplicacao || '';
        vB = b.aplicacao || '';
      }
      
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [filteredData, sortBy, sortDir]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center' }} className='ms-4 me-3 my-2 justify-content-between'>
        <h4 className='d-flex justify-content-start mb-0' style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400 }}>
          Data Overview
        </h4>
        <div className='d-flex flex-row align-items-center justify-content-center gap-2'>
          {/* Ordenação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Sort by</span>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as 'emissao' | 'situacao' | 'model' | 'jobsite' | 'solicitacao' | 'aplicacao')}
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
                <option value="emissao">Emission Date</option>
                <option value="situacao">Situation</option>
                <option value="model">Model</option>
                <option value="jobsite">Jobsite</option>
                <option value="solicitacao">Request Date</option>
                <option value="aplicacao">Application Date</option>
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
                <i className="bi bi-sort-alpha-down" />
              ) : (
                <i className="bi bi-sort-alpha-up" />
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
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Model</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Jobsite</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Lot/Address</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Situation</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Request Date</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Application Date</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Emission Date</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>Observation</th>
                <th style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-primary)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--color-background-secondary)', zIndex: 2 }}>File</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length > 0 ? (
                sortedData.map((row, index) => (
                  <tr key={index}>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{row.model || 'N/A'}</td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{row.jobsite || 'N/A'}</td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{row.lot_address || 'N/A'}</td>
                    <td style={{ 
                      padding: 8, 
                      border: '1px solid var(--color-border-divider)', 
                      textAlign: 'left',
                      color: row.situacao === 'Issued' ? '#1bbf5c' : 
                             row.situacao === 'Applied' ? '#ffc107' : 
                             row.situacao === 'Not Applied' ? '#dc3545' : 
                             'var(--color-text-secondary)',
                      fontWeight: row.situacao ? 500 : 400
                    }}>
                      {row.situacao || 'N/A'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.solicitacao ? new Date(row.solicitacao).toLocaleDateString('pt-BR') : 'N/A'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.aplicacao ? new Date(row.aplicacao).toLocaleDateString('pt-BR') : 'N/A'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                      {row.emissao ? new Date(row.emissao).toLocaleDateString('pt-BR') : 'N/A'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{row.observacao || 'N/A'}</td>
                    <td style={{ padding: 8, border: '1px solid var(--color-border-divider)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>{row.arquivo || 'N/A'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} style={{ 
                    padding: 20, 
                    border: '1px solid var(--color-border-divider)', 
                    color: 'var(--color-text-secondary)', 
                    textAlign: 'center',
                    fontStyle: 'italic'
                  }}>
                    Nenhum dado encontrado para os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
} 