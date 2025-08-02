import React from 'react';
import { getProjectName } from './utils/projectUtils';

interface ProjectCardProps {
  id: string;
  customerName: string | null;
  customerId: string | null;
  status: string;
  date: string | null;
  expenseCount: number;
  invoiceCount: number;
  paymentsMadeCount: number;
  paymentsReceivedCount: number;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
  estimateTotal: number; // valor total do estimate
  invoicesTotal: number; // soma dos invoices
  expensesTotal: number; // soma dos expenses
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
  hovered,
  onHover,
  onClick,
  estimateTotal,
  invoicesTotal,
  expensesTotal
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
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, height: '100%', boxSizing: 'border-box' }}>
        {/* Bloco data + título */}
        <div style={{ width: '100%', textAlign: 'center', marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500, display: 'block', margin: '4px 0' }}>
            {date ? (() => {
              const d = new Date(date);
              return d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
            })() : '-'}
          </span>
          <h3
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--color-text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'normal',
              lineHeight: 1.3,
              letterSpacing: 0.1,
              maxWidth: 220,
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}
          >
            {projectName}
          </h3>
        </div>
        {/* Barras de Progresso Financeira */}
        <div style={{margin:'6px 0' , width: '100%', boxSizing: 'border-box', height: 42, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {/* Determina o referencial baseado no maior valor entre Estimate e Expense */}
          {(() => {
            const referenceValue = Math.max(estimateTotal, expensesTotal);
            const expensePercentage = referenceValue > 0 ? (expensesTotal / referenceValue) * 100 : 0;
            
            return (
              <>
                {/* Barra de Expenses (superior) - sem background, apenas cresce */}
                <div style={{ position: 'relative', width: '100%', height: 15, borderRadius: 4, overflow: 'visible' }}>
                  {referenceValue > 0 && expensesTotal > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${Math.min(100, expensePercentage)}%`,
                      background: '#dc3545', // vermelho
                      borderRadius: 4,
                      transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                      zIndex: 2,
                      border: '1px solid var(--color-border-divider)'
                    }} />
                  )}
                </div>
                
                {/* Barra de Invoice (inferior) - com background cinza como Estimate */}
                <div style={{ position: 'relative', width: '100%', height: 15, overflow: 'visible' }}>
                  {/* Container da barra com borda redimensionada */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${Math.min(100, (estimateTotal / referenceValue) * 100)}%`,
                    borderRadius: 4,
                    border: '1px solid var(--color-border-divider)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    background: 'var(--color-background-secondary)',
                    transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                    zIndex: 1
                  }}>
                    {/* Barra de Invoice (verde) sobreposta */}
                    {referenceValue > 0 && invoicesTotal > 0 && (
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${Math.min(100, (invoicesTotal / estimateTotal) * 100)}%`,
                        background: '#1bbf5c', // verde
                        borderRadius: 4,
                        transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                        zIndex: 2
                      }} />
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
        {/* Bloco de métricas */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{
            width: '100%',
            background: 'transparent',
            borderRadius: 6,
            marginTop: 0,
            marginBottom: 8,
            boxSizing: 'border-box',
            padding: 0,
            fontSize: 13,
            color: 'var(--color-text-primary)',
            fontWeight: 400,
            display: 'flex',
            flexDirection: 'column',
            gap: 0
          }}>
            {/* Estimate */}
            <div style={{ padding: '4px 0', fontWeight: 500, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>Estimate</span>
              <span style={{ fontWeight: 500 }}>{estimateTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            </div>
            <div style={{ borderBottom: '1px solid var(--color-border-divider)', width: '100%' }} />
            {/* Invoice */}
            <div style={{ padding: '4px 0', fontWeight: 500, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>Invoice</span>
              <span style={{ fontWeight: 500 }}>{invoicesTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            </div>
            <div style={{ borderBottom: '1px solid var(--color-border-divider)', width: '100%' }} />
            {/* Expense */}
            <div style={{ padding: '4px 0', fontWeight: 500, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>Expense</span>
              <span style={{ fontWeight: 500 }}>{expensesTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
            </div>
            <div style={{ borderBottom: '1px solid var(--color-border-divider)', width: '100%' }} />
            {/* Profit */}
            <div style={{ padding: '4px 0', fontWeight: 500, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>Profit</span>
              <span style={{ fontWeight: 500, color: (invoicesTotal - expensesTotal) < 0 ? '#dc3545' : 'var(--color-accent-primary)' }}>
                {(invoicesTotal - expensesTotal).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} • {invoicesTotal > 0 ? Math.round(((invoicesTotal - expensesTotal) / invoicesTotal) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard; 