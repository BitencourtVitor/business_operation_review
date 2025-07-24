import React from 'react';
import { formatCurrency, formatDateUS } from './utils/projectUtils';
import BillPaymentsTooltip from './BillPaymentsTooltip';
import CloseButton from '../../../utils/CloseButton';

// Tipos simplificados para exemplo
interface Expense {
  id: string;
  doc_number?: string | null;
  external_id?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
  expense_type: 'bill' | 'purchase' | 'vendor_credit';
  lines: Array<{ id: string; description: string | null; amount: number | null; account_ref_name?: string | null }>;
  bill_payments: Array<{ id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null; private_note?: string | null }>;
}

export interface Invoice {
  id: string;
  doc_number?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
  is_deposit?: boolean;
  payments?: Array<{ id: string; total_amount?: number | null; txn_date?: string | null; payment_ref?: string | null; private_note?: string | null }>;
  is_backcharge?: boolean;
  description?: string | null;
  private_note?: string | null;
}

interface ProjectDetailsModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  customerId: string;
  estimateDate: string;
  estimateTotal: number;
  estimateLines: Array<{ id: string; description: string | null; amount: number | null }>;
  expenses: Record<string, unknown>[];
  invoices: Invoice[];
  loading?: boolean;
}

const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
  open,
  onClose,
  projectName,
  customerId,
  estimateDate,
  estimateTotal,
  estimateLines,
  expenses,
  invoices,
  loading
}) => {
  const [expandedExpenseGroups, setExpandedExpenseGroups] = React.useState<Set<string>>(new Set());
  const [hoveredExpenseLineIdx, setHoveredExpenseLineIdx] = React.useState<string | null>(null);
  const [billPaymentTooltip, setBillPaymentTooltip] = React.useState<{
    show: boolean;
    x: number;
    y: number;
    payments: Array<{ id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null; private_note?: string | null }>;
    accountName: string;
  }>({ show: false, x: 0, y: 0, payments: [], accountName: '' });
  // O accordion deve estar aberto por padrão ao abrir o modal
  const [itemsOpen, setItemsOpen] = React.useState(true);

  // Cores e ícones do robusto
  const COLORS = {
    estimate: '#6c757d',
    bill: '#f28b82',
    billStrong: '#d32f2f',
    purchase: '#ff9800',
    purchaseStrong: '#f57c00',
    vendorCredit: '#4caf50',
    vendorCreditStrong: '#388e3c',
    billpayment: '#f28b82',
    invoice: '#a7e9af',
    invoiceStrong: '#388e3c',
    payment: '#a7e9af',
    deposit: '#ff5722',
    depositStrong: '#d84315',
  };
  const ICONS = {
    estimate: 'bi-clipboard-data',
    invoice: 'bi-receipt',
    payment: 'bi-credit-card',
    bill: 'bi-file-earmark-text',
    purchase: 'bi-cart',
    vendorCredit: 'bi-arrow-return-left',
    billpayment: 'bi-cash-stack',
    deposit: 'bi-arrow-return-right',
  };
  // Estado para hover e seleção de Invoice
  const [hoveredInvoiceIdx, setHoveredInvoiceIdx] = React.useState<number | null>(null);
  const [selectedInvoiceIdx, setSelectedInvoiceIdx] = React.useState<number | null>(null);

  // Agrupar todas as expense lines por account_ref_name (sempre chamado)
  const groupedExpenseLines = React.useMemo(() => {
    const map = new Map<string, { accountRefName: string; totalAmount: number; lines: Array<{
      id: string;
      expense: Expense;
      line: { id: string; description: string | null; amount: number | null; account_ref_name?: string | null };
      bill_payments: Expense['bill_payments'];
    }> }>();
    expenses.forEach(expense => {
      (expense.lines as Record<string, unknown>[]).forEach(line => {
        const accountRefName = (line as { account_ref_name?: string | null }).account_ref_name || 'Sem categoria';
        if (!map.has(accountRefName)) {
          map.set(accountRefName, { accountRefName, totalAmount: 0, lines: [] });
        }
        const group = map.get(accountRefName)!;
        group.totalAmount += Number((line as { amount?: unknown }).amount) || 0;
        group.lines.push({ 
          id: (line as { id: string }).id, 
          expense: expense as unknown as Expense, 
          line: line as unknown as { id: string; description: string | null; amount: number | null; account_ref_name?: string | null }, 
          bill_payments: (expense as unknown as Expense).bill_payments 
        });
      });
    });
    return Array.from(map.values());
  }, [expenses]);

  React.useEffect(() => {
    // Garante que o spinner CSS está presente
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  if (!open) return null;

  // Defina o tamanho do modal em percentual da tela
  const MODAL_SIZE_PERCENT = 60; // Altere este valor para testar o tamanho do modal em relação à tela
  const MODAL_MAX_HEIGHT_PERCENT = 75; // Altura máxima do modal em relação à tela

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.18)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
        backdropFilter: 'blur(4px)', // Desfoque do fundo
        WebkitBackdropFilter: 'blur(4px)', // Compatibilidade Safari
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: 18,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: `${MODAL_SIZE_PERCENT}vw`,
          maxWidth: `${MODAL_SIZE_PERCENT}vw`,
          maxHeight: `${MODAL_MAX_HEIGHT_PERCENT}vh`,
          height: 'auto',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1), min-height 0.4s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          position: 'relative',
          boxSizing: 'border-box',
          border: '1px solid var(--color-border-divider)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '2vh 2vw', borderBottom: '1px solid var(--color-border-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
          <h5 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)', letterSpacing: 0.1 }}>{projectName}</h5>
          <CloseButton onClick={onClose} size="md" style={{ transition: 'background 0.2s, box-shadow 0.2s', borderRadius: 6, border: 'none', cursor: 'pointer' }} />
        </div>
        {/* Corpo principal */}
        <div style={{ padding: '2vw', flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, maxHeight: `calc(${MODAL_MAX_HEIGHT_PERCENT}vh - 4vh)`, boxSizing: 'border-box', scrollbarWidth: 'thin' }} className="custom-scrollbar">
          {loading ? (
            <div style={{ height: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  border: '3px solid var(--color-border-divider)',
                  borderTop: '3px solid var(--color-accent-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Carregando dados...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Bloco Estimate Moderno */}
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 12, padding: '1.5vh 1.5vw', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid var(--color-border-divider)', marginBottom: '2vh', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 18 }}>
                    <span><i className="bi bi-calendar-event" style={{ marginRight: 4 }} />{formatDateUS(estimateDate)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.9375rem' }}>ID {customerId || '-'}</span>
                    <span style={{ color: 'var(--color-accent-primary)', fontWeight: 700, fontSize: '1.125rem' }}>{formatCurrency(estimateTotal)}</span>
                  </div>
                </div>
                {/* Accordion de itens do estimate com animação de expansão */}
                <div style={{ marginBottom: 0 }}>
                  <button
                    onClick={() => setItemsOpen(o => !o)}
                    style={{
                      background: 'var(--color-background-secondary)',
                      color: 'var(--color-accent-primary)',
                      border: '1px solid var(--color-border-divider)',
                      borderRadius: 6,
                      width: 'auto',
                      height: '3.4vh',
                      minWidth: '3.4vh',
                      minHeight: '3.4vh',
                      fontWeight: 500,
                      fontSize: '0.9375rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'background 0.2s, color 0.2s, border 0.2s',
                      marginBottom: 10,
                      padding: '0 1.2vw',
                    }}
                    aria-label={itemsOpen ? 'Ocultar itens do estimate' : 'Exibir itens do estimate'}
                    title={itemsOpen ? 'Ocultar itens do estimate' : 'Exibir itens do estimate'}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-background-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-background-secondary)'; }}
                  >
                    <i className={`bi ${itemsOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 14, color: 'var(--color-accent-primary)' }} />
                    {itemsOpen ? 'Ocultar itens' : 'Exibir itens'}
                  </button>
                  <div
                    style={{
                      maxHeight: itemsOpen ? '30vh' : 0,
                      opacity: itemsOpen ? 1 : 0,
                      overflow: 'hidden',
                      transition: 'max-height 0.4s cubic-bezier(0.4, 0.2, 0.2, 1), opacity 0.3s, padding 0.3s',
                      background: 'var(--color-background-primary)',
                      borderRadius: 8,
                      marginTop: 0,
                      boxShadow: itemsOpen ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
                      pointerEvents: itemsOpen ? 'auto' : 'none',
                    }}
                  >
                    {itemsOpen && estimateLines && estimateLines.length > 0 ? (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: 'var(--color-text-primary)', fontSize: '0.9375rem', fontWeight: 400 }}>
                        {estimateLines.map((line, idx) => (
                          <li key={String(line.id) || String(idx)} style={{ width: '100%', boxSizing: 'border-box', padding: '0 1.8vw', height: '3.8vh', display: 'flex', alignItems: 'center', borderBottom: idx < estimateLines.length - 1 ? '1px solid var(--color-border-divider)' : 'none', background: 'transparent' }}>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, flex: 3, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9375rem' }}>{line.description || '-'}</span>
                            <span style={{ color: 'var(--color-accent-primary)', fontWeight: 700, minWidth: '9vw', textAlign: 'right', fontSize: '0.9375rem' }}>{formatCurrency(Number(line.amount))}</span>
                          </li>
                        ))}
                      </ul>
                    ) : itemsOpen ? <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: 8, fontSize: '0.9375rem' }}>Nenhum item cadastrado para este estimate.</div> : null}
                  </div>
                </div>
              </div>
              {/* Bills e Invoices */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: '2vw', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', height: 'calc(100% - 30vh - 4vh)', overflowX: 'hidden' }}>
                {/* Coluna Bills (a pagar) */}
                <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', height: '100%' }}>
                  {/* Bloco Bills (superior) */}
                  <div style={{ background: COLORS.billpayment + '11', border: `1px solid ${COLORS.billStrong}`, borderRadius: 10, padding: '1vh 1.8vw 0 1.8vw', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ color: COLORS.billStrong, fontWeight: 700, fontSize: '1rem', paddingBottom: 10, marginBottom: 10, marginLeft: '-1.8vw', marginRight: '-1.8vw', paddingLeft: '1.8vw', paddingRight: '1.8vw', borderBottom: `1px solid ${COLORS.billStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`bi ${ICONS.bill}`} style={{ fontSize: 18 }} /> Expenses
                      </div>
                      <span style={{ color: COLORS.billStrong, fontWeight: 600, fontSize: '0.875rem' }}>
                        {(() => {
                          const totalExpenses = expenses.reduce((total: number, e: Record<string, unknown>) => {
                            const expense = e as unknown as Expense;
                            // Somar apenas os valores das linhas relacionadas ao projeto
                            const linesTotal = expense.lines.reduce((lineTotal, line) => {
                              return lineTotal + Number(line.amount || 0);
                            }, 0);
                            return total + linesTotal;
                          }, 0);
                          return totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                        })()}
                      </span>
                    </div>
                    {/* Header das colunas */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.8vw 0.6vh 0.8vw', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                      <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--color-text-secondary)' }} title="Data"><i className="bi bi-calendar-event" /></span>
                      <span style={{ flex: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--color-text-secondary)' }} title="Descrição"><i className="bi bi-file-earmark-text" /></span>
                      <span style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--color-text-secondary)' }} title="Valor"><i className="bi bi-currency-dollar" /></span>
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', marginBottom: 12, flex: 1, overflowY: 'auto', fontSize: '0.8125rem' }}>
                      {groupedExpenseLines.map((group, groupIdx) => {
                        const groupKey = `group-${groupIdx}`;
                        const isExpanded = expandedExpenseGroups.has(groupKey);
                        return (
                          <React.Fragment key={groupKey}>
                            {/* Linha do grupo */}
                            <li
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: 13,
                                padding: '0 8px',
                                height: 32,
                                borderBottom: '1px solid var(--color-border-divider)',
                                width: '100%',
                                position: 'relative',
                                background: 'transparent',
                                borderRadius: 0,
                                transition: 'background 0.2s',
                                fontWeight: 500,
                              }}
                            >
                              <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>-</span>
                              <span style={{ flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--color-text-primary)',fontSize: 14 }}>
                                {group.accountRefName}
                              </span>
                              <span style={{ flex: 1.5, color: COLORS.billStrong, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>
                                {group.totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                              </span>
                              {/* Botão de seta para expandir/colapsar */}
                              <button
                                type="button"
                                aria-label={isExpanded ? 'Colapsar detalhes' : 'Expandir detalhes'}
                                title={isExpanded ? 'Colapsar detalhes' : 'Expandir detalhes'}
                                style={{
                                  position: 'absolute',
                                  right: 8,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  color: COLORS.billStrong,
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: 16,
                                  padding: 0,
                                  outline: 'none',
                                  transition: 'transform 0.2s, color 0.2s',
                                }}
                                onClick={e => {
                                  e.stopPropagation();
                                  const newExpanded = new Set(expandedExpenseGroups);
                                  if (isExpanded) {
                                    newExpanded.delete(groupKey);
                                  } else {
                                    newExpanded.add(groupKey);
                                  }
                                  setExpandedExpenseGroups(newExpanded);
                                }}
                              >
                                <i 
                                  className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`} 
                                  style={{ 
                                    fontSize: 14, 
                                    verticalAlign: 'middle',
                                    transform: isExpanded ? 'rotate(0deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              </button>
                            </li>
                            {/* Linhas expandidas do grupo */}
                            {isExpanded && (
                              <li
                                style={{
                                  background: 'rgba(242,139,130,0.08)',
                                  borderRadius: 0,
                                  margin: 0,
                                  padding: '0 8px',
                                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                                  transition: 'all 0.3s',
                                  display: 'block',
                                }}
                              >
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                  {(group.lines as Record<string, unknown>[]).map((item, lineIdx) => (
                                    <li
                                      key={String(item.id) || String(lineIdx)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: 12,
                                        padding: '0 0 0 16px',
                                        height: 28,
                                        borderBottom: lineIdx < (group.lines as Record<string, unknown>[]).length - 1 ? '1px solid var(--color-border-divider)' : 'none',
                                        width: '100%',
                                        position: 'relative',
                                        background: hoveredExpenseLineIdx === item.id ? 'rgba(242,139,130,0.12)' : 'transparent',
                                        borderRadius: 0,
                                        transition: 'background 0.2s',
                                      }}
                                      onMouseEnter={() => setHoveredExpenseLineIdx(String(item.id))}
                                      onMouseLeave={() => setHoveredExpenseLineIdx(null)}
                                    >
                                      <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                        {formatDateUS((item as { expense: Expense }).expense.txn_date) || ''}
                                      </span>
                                      <span style={{ flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', fontSize: 11 }}>
                                        {(item as { line: { description: string | null; account_ref_name?: string | null } }).line.description || (item as { line: { account_ref_name?: string | null } }).line.account_ref_name || ''}
                                      </span>
                                      <span style={{ flex: 1.5, color: COLORS.billStrong, textAlign: 'left', fontSize: 11 }}>
                                        {formatCurrency(Number((item as { line: { amount: unknown } }).line.amount))}
                                      </span>
                                      {/* Botão de olho para ver bill payments */}
                                      {hoveredExpenseLineIdx === item.id && (item as { bill_payments: Expense['bill_payments'] }).bill_payments.length > 0 && (
                                        <button
                                          type="button"
                                          aria-label="Ver bill payments"
                                          title="Ver bill payments"
                                          style={{
                                            position: 'absolute',
                                            right: 8,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: COLORS.billStrong,
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: 14,
                                            padding: 0,
                                            outline: 'none',
                                            transition: 'color 0.2s',
                                          }}
                                          onClick={e => {
                                            e.stopPropagation();
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setBillPaymentTooltip({
                                              show: true,
                                              x: rect.left + rect.width / 2,
                                              y: rect.bottom + 10,
                                              payments: (item as { bill_payments: Expense['bill_payments'] }).bill_payments,
                                              accountName: (item as { line: { account_ref_name?: string | null } }).line.account_ref_name || 'Sem categoria'
                                            });
                                          }}
                                        >
                                          <i className="bi bi-eye" style={{ fontSize: 12, verticalAlign: 'middle' }} />
                                        </button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </ul>
                  </div>
                </div>
                {/* Coluna Invoices (a receber) */}
                <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', height: '100%' }}>
                  {/* Bloco Invoices (superior) */}
                  <div style={{ background: COLORS.payment + '11', border: `1px solid ${COLORS.invoiceStrong}`, borderRadius: 10, padding: '1vh 1.8vw 0 1.8vw', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ color: COLORS.invoiceStrong, fontWeight: 700, fontSize: '1rem', paddingBottom: 10, marginBottom: 10, marginLeft: '-1.8vw', marginRight: '-1.8vw', paddingLeft: '1.8vw', paddingRight: '1.8vw', borderBottom: `1px solid ${COLORS.invoiceStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={`bi ${ICONS.invoice}`} style={{ fontSize: 18, color: COLORS.invoiceStrong, marginRight: 8, verticalAlign: 'middle' }} /> Invoices
                      </div>
                      <span style={{ color: COLORS.invoiceStrong, fontWeight: 600, fontSize: '0.875rem' }}>
                        {(() => {
                          const totalInvoices = invoices.reduce((total: number, inv: Invoice) => {
                            return total + Number(inv.total_amount || 0);
                          }, 0);
                          return totalInvoices.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                        })()}
                      </span>
                    </div>
                    {/* Header das colunas */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.8vw 0.6vh 0.8vw', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                      <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--color-text-secondary)' }} title="Data"><i className="bi bi-calendar-event" /></span>
                      <span style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--color-text-secondary)' }} title="Número"><i className="bi bi-file-earmark-text" /></span>
                      <span style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', color: 'var(--color-text-secondary)' }} title="Total"><i className="bi bi-currency-dollar" /></span>
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', marginBottom: 12, flex: 1, overflowY: 'auto', fontSize: '0.8125rem' }}>
                      {invoices.map((inv, idx) => {
                        const isDeposit = inv.is_deposit === true;
                        const totalAmount = Number(inv.total_amount) || 0;
                        
                        return (
                          <React.Fragment key={String(inv.id) || String(idx)}>
                            <li
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: 13,
                                padding: '0 8px',
                                height: 32,
                                borderBottom: idx < invoices.length - 1 ? '1px solid var(--color-border-divider)' : 'none',
                                width: '100%',
                                position: 'relative',
                                background: hoveredInvoiceIdx === idx ? (isDeposit ? 'rgba(255,87,34,0.10)' : 'rgba(167,233,175,0.10)') : selectedInvoiceIdx === idx ? (isDeposit ? 'rgba(255,87,34,0.18)' : 'rgba(167,233,175,0.18)') : 'transparent',
                                borderRadius: 0,
                                transition: 'background 0.2s, margin-bottom 0.2s',
                              }}
                              onMouseEnter={() => setHoveredInvoiceIdx(idx !== undefined ? idx : null)}
                              onMouseLeave={() => setHoveredInvoiceIdx(null)}
                            >
                              <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{formatDateUS(inv.txn_date) || ''}</span>
                              <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                                {inv.doc_number || ''}
                                {isDeposit && <i className={`bi ${ICONS.deposit}`} style={{ marginLeft: 4, fontSize: 10, color: COLORS.depositStrong }} />}
                              </span>
                              <span style={{ 
                                flex: 1.5, 
                                color: isDeposit ? COLORS.depositStrong : COLORS.invoiceStrong, 
                                textAlign: 'left',
                                fontWeight: isDeposit ? 600 : 400
                              }}>
                                {totalAmount ? totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}
                              </span>
                              {/* Botão de olho só aparece em hover ou selecionado */}
                              {(hoveredInvoiceIdx === idx || selectedInvoiceIdx === idx) && (
                                <button
                                  type="button"
                                  aria-label="Ver payments"
                                  title="Ver payments"
                                  style={{
                                    position: 'absolute',
                                    right: 8,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: selectedInvoiceIdx === idx ? COLORS.invoiceStrong : COLORS.invoice,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: 18,
                                    padding: 0,
                                    outline: 'none',
                                    transition: 'color 0.2s',
                                  }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setSelectedInvoiceIdx(selectedInvoiceIdx === idx ? null : idx);
                                  }}
                                >
                                  <i className="bi bi-eye" style={{ fontSize: 16, verticalAlign: 'middle' }} />
                                </button>
                              )}
                            </li>
                            {/* Bloco animado de payments do invoice selecionado */}
                            {selectedInvoiceIdx === idx && Array.isArray(inv.payments) && inv.payments.length > 0 && (
                              <li
                                style={{
                                  background: COLORS.payment + '22',
                                  borderRadius: 8,
                                  margin: '8px 0',
                                  padding: '12px 18px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                  animation: 'fadeSlideIn 0.4s cubic-bezier(0.4, 0.2, 0.2, 1)',
                                  transition: 'all 0.3s',
                                  display: 'block',
                                }}
                              >
                                <div style={{ color: COLORS.invoiceStrong, fontWeight: 600, fontSize: 15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <i className={`bi ${ICONS.payment}`} style={{ color: COLORS.invoiceStrong, fontSize: 18 }} /> Payments Recebidos
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 6px 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                  <span style={{ flex: 1.5, color: 'var(--color-text-secondary)' }}>Data</span>
                                  <span style={{ flex: 2, color: 'var(--color-text-secondary)' }}>Nota</span>
                                  <span style={{ flex: 2, color: 'var(--color-text-secondary)' }}>Ref</span>
                                  <span style={{ flex: 1.5, color: 'var(--color-text-secondary)' }}>Valor</span>
                                </div>
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                  {(inv.payments || []).map((payment, i) => {
                                    return (
                                      <li key={String(payment.id) || String(i)} style={{ display: 'flex', alignItems: 'center', fontSize: 13, padding: '0 0 0 0', height: 32, borderBottom: i < (inv.payments ? inv.payments.length - 1 : 0) ? '1px solid var(--color-border-divider)' : 'none', width: '100%' }}>
                                        <span style={{ flex: 1.5, color: 'var(--color-text-secondary)', textAlign: 'left', fontSize: '0.6875rem' }}>{formatDateUS(payment.txn_date)}</span>
                                        <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.6875rem', color: 'var(--color-text-primary)' }} title={payment.private_note || ''}>{payment.private_note || '-'}</span>
                                        <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.6875rem', color: 'var(--color-text-primary)' }} title={payment.payment_ref || ''}>{payment.payment_ref || '-'}</span>
                                        <span style={{ flex: 1.5, color: COLORS.invoiceStrong, textAlign: 'left', fontSize: '0.6875rem' }}>{payment.total_amount ? payment.total_amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </li>
                            )}
                            {selectedInvoiceIdx === idx && inv.is_backcharge && (
                              <li
                                style={{
                                  background: COLORS.deposit + '22',
                                  borderRadius: 8,
                                  margin: '8px 0',
                                  padding: '12px 18px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                  animation: 'fadeSlideIn 0.4s cubic-bezier(0.4, 0.2, 0.2, 1)',
                                  transition: 'all 0.3s',
                                  display: 'block',
                                }}
                              >
                                {/* Removido o bloco da data */}
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 400, marginBottom: 0, whiteSpace: 'pre-line' }}>
                                  {inv.description || ''}
                                </div>
                                <hr style={{ border: 0, borderTop: '1px solid var(--color-border-divider)', margin: '6px 0' }} />
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 400, marginBottom: 0, whiteSpace: 'pre-line' }}>
                                  {inv.private_note || ''}
                                </div>
                              </li>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Tooltip personalizada para Bill Payments */}
        {billPaymentTooltip.show && (
          <BillPaymentsTooltip
            show={billPaymentTooltip.show}
            x={billPaymentTooltip.x}
            y={billPaymentTooltip.y}
            payments={billPaymentTooltip.payments}
            accountName={billPaymentTooltip.accountName}
            onClose={() => setBillPaymentTooltip(prev => ({ ...prev, show: false }))}
          />
        )}
      </div>
    </div>
  );
};

export default ProjectDetailsModal; 