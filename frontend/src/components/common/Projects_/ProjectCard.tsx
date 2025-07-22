import React from 'react';
import { getProjectName, formatCurrency } from './utils/projectUtils';

interface ProjectCardProps {
  id: string;
  customerName: string | null;
  customerId: string | null;
  status: string;
  date: string | null;
  totalAmount: number | null;
  billCount: number;
  invoiceCount: number;
  paymentsMadeCount: number;
  paymentsReceivedCount: number;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}

const STATUS = {
  'Accepted': { color: '#1bbf5c', icon: 'bi-check-circle-fill' },
  'Pending': { color: '#ffc107', icon: 'bi-clock-fill' },
  'Rejected': { color: '#dc3545', icon: 'bi-x-circle-fill' },
};

const ProjectCard: React.FC<ProjectCardProps> = ({
  id,
  customerName,
  customerId,
  status,
  date,
  totalAmount,
  billCount,
  invoiceCount,
  paymentsMadeCount,
  paymentsReceivedCount,
  hovered,
  onHover,
  onClick
}) => {
  const projectName = getProjectName(customerName);
  return (
    <div
      style={{
        minWidth: 230,
        maxWidth: 320,
        background: 'var(--color-background-primary)',
        border: '1px solid var(--color-border-divider)',
        borderRadius: 8,
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.15)' : '0 2px 12px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        height: '320px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        marginTop: 0,
        marginBottom: 0,
        transform: hovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)'
      }}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      title={hovered ? projectName : ''}
    >
      {/* Cabeçalho */}
      <div className="px-3" style={{ borderBottom: '1px solid var(--color-border-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, background: 'var(--color-background-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: STATUS[status as keyof typeof STATUS]?.color || 'var(--color-text-secondary)' }}>
            <i className={STATUS[status as keyof typeof STATUS]?.icon || 'bi-circle'} />
          </span>
          <span style={{ color: STATUS[status as keyof typeof STATUS]?.color || 'var(--color-text-secondary)', fontWeight: 700, fontSize: 12, letterSpacing: 0.2 }}>{status}</span>
        </div>
        <span style={{ color: 'var(--color-accent-primary)', fontSize: 14, fontWeight: 500, letterSpacing: 0.1 }}>{customerId || '-'}</span>
      </div>
      {/* Corpo */}
      <div style={{ padding: '16px 20px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1, height: '100%', boxSizing: 'border-box' }}>
        {/* Data do projeto */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            {date ? (() => {
              const d = new Date(date);
              return d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
            })() : '-'}
          </span>
        </div>
        {/* Título do projeto */}
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, letterSpacing: 0.1 }}>{projectName}</h3>
        </div>
        {/* Métricas responsivas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
          {/* Primeira linha - Bills (esquerda) e Invoices (direita) */}
          <div style={{ display: 'flex', gap: 10, width: '100%', flex: 1 }}>
            {/* Bills */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 6px', background: 'rgba(242,139,130,0.06)', borderRadius: 6, border: '1px solid rgba(242,139,130,0.15)', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, textAlign: 'center' }}>Bills</div>
              <div style={{ fontSize: 16, color: 'var(--challenges-color)', fontWeight: 700, textAlign: 'center' }}>{billCount}</div>
            </div>
            {/* Invoices */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 6px', background: 'rgba(167,233,175,0.06)', borderRadius: 6, border: '1px solid rgba(167,233,175,0.15)', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, textAlign: 'center' }}>Invoices</div>
              <div style={{ fontSize: 16, color: 'var(--color-accent-primary)', fontWeight: 700, textAlign: 'center' }}>{invoiceCount}</div>
            </div>
          </div>
          {/* Segunda linha - Pagamentos Feitos (esquerda) e Recebidos (direita) */}
          <div style={{ display: 'flex', gap: 10, width: '100%', flex: 1 }}>
            {/* Pagamentos Feitos */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 6px', background: 'rgba(242,139,130,0.06)', borderRadius: 6, border: '1px solid rgba(242,139,130,0.15)', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, textAlign: 'center' }}>Pag. Feitos</div>
              <div style={{ fontSize: 16, color: 'var(--challenges-color)', fontWeight: 700, textAlign: 'center' }}>{paymentsMadeCount}</div>
            </div>
            {/* Pagamentos Recebidos */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 6px', background: 'rgba(167,233,175,0.06)', borderRadius: 6, border: '1px solid rgba(167,233,175,0.15)', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, textAlign: 'center' }}>Pag. Recebidos</div>
              <div style={{ fontSize: 16, color: 'var(--color-accent-primary)', fontWeight: 700, textAlign: 'center' }}>{paymentsReceivedCount}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard; 