import React from 'react';
import { formatCurrency, formatDateUS } from './utils/projectUtils';

interface BillPayment {
  id: string;
  doc_number?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
  private_note?: string | null;
}

interface BillPaymentsTooltipProps {
  show: boolean;
  x: number;
  y: number;
  payments: BillPayment[];
  accountName: string;
  onClose: () => void;
}

const BillPaymentsTooltip: React.FC<BillPaymentsTooltipProps> = ({ show, x, y, payments, accountName, onClose }) => {
  if (!show) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x - 200,
        width: 400,
        background: 'var(--color-background-secondary)',
        border: '1px solid #d32f2f',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 2147483648,
        padding: 16,
        color: 'var(--color-text-primary)',
        fontSize: 13,
        maxHeight: 300,
        overflowY: 'auto',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--color-border-divider)' }}>
        <div style={{ color: '#d32f2f', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="bi bi-cash-stack" style={{ fontSize: 16 }} />
          Bill Payments - {accountName}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 16, padding: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4 }}
        >
          <i className="bi bi-x" />
        </button>
      </div>
      {payments.length > 0 ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 8px 0', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            <span style={{ flex: 1.5 }}>Data</span>
            <span style={{ flex: 2 }}>Número</span>
            <span style={{ flex: 2 }}>Nota</span>
            <span style={{ flex: 1.5 }}>Valor</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {payments.map((bp, i) => (
              <li key={bp.id || i} style={{ display: 'flex', alignItems: 'center', fontSize: 12, padding: '6px 0', borderBottom: i < payments.length - 1 ? '1px solid var(--color-border-divider)' : 'none', width: '100%' }}>
                <span style={{ flex: 1.5, color: 'var(--color-text-secondary)' }}>{formatDateUS(bp.txn_date)}</span>
                <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bp.doc_number || '-'}</span>
                <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bp.private_note || '-'}</span>
                <span style={{ flex: 1.5, color: '#d32f2f', fontWeight: 600 }}>{formatCurrency(bp.total_amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
          Nenhum pagamento encontrado para esta linha.
        </div>
      )}
    </div>
  );
};

export default BillPaymentsTooltip; 