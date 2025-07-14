import React, { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import useQuickbooksData from '../../../hooks/useQuickbooksData';
import CloseButton from '../../../utils/CloseButton';
import ConnectedLine from './ConnectedLine';

const STATUS = {
  'Accepted': { color: '#1bbf5c', icon: 'bi-check-circle-fill' },
  'Pending': { color: '#ffc107', icon: 'bi-clock-fill' },
  'Rejected': { color: '#dc3545', icon: 'bi-x-circle-fill' },
};

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const formatCurrency = (amount?: number | null) => {
  if (typeof amount !== 'number' || isNaN(amount)) return 'R$ 0,00';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

function getProjectName(rawName?: string | null) {
  if (!rawName) return '';
  const parts = rawName.split(':');
  return parts[parts.length - 1].trim();
}

export default function AcceptedEstimatesCarousel() {
  const {
    estimatesRel,
    loading,
    error,
  } = useQuickbooksData();

  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'total' | null>(null);
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, scroll: 0, dragging: false });
  const colunasRef = React.useRef<HTMLDivElement>(null);

  // Busca e ordenação
  const filteredEstimates = useMemo(() => {
    let filtered = estimatesRel;
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter(e =>
        getProjectName(e.estimate.customer_name).toLowerCase().includes(lower) ||
        (e.estimate.doc_number || '').toLowerCase().includes(lower)
      );
    }
    if (sortBy === 'date') {
      filtered = [...filtered].sort((a, b) => new Date(b.estimate.txn_date || '').getTime() - new Date(a.estimate.txn_date || '').getTime());
    } else if (sortBy === 'total') {
      filtered = [...filtered].sort((a, b) => (b.estimate.total_amount || 0) - (a.estimate.total_amount || 0));
    }
    return filtered;
  }, [estimatesRel, searchText, sortBy]);

  // Drag horizontal
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current.dragging = true;
    drag.current.x = e.clientX;
    drag.current.scroll = carouselRef.current?.scrollLeft || 0;
    document.body.style.cursor = 'grabbing';
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!drag.current.dragging) return;
    if (carouselRef.current) {
      const dx = drag.current.x - e.clientX;
      carouselRef.current.scrollLeft = drag.current.scroll + dx;
    }
  };
  const onMouseUp = () => {
    drag.current.dragging = false;
    document.body.style.cursor = '';
  };
  React.useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Busca UX
  const handleOpenSearch = () => {
    setSearchOpen(true);
    setTimeout(() => {
      (document.getElementById('accepted-estimates-search') as HTMLInputElement)?.focus();
    }, 100);
  };
  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchText('');
  };

  // Modal
  function handleOpenModal(idx: number) {
    setModalIdx(idx);
  }
  function handleCloseModal() {
    setModalIdx(null);
  }

  // Estado para hover de Bill/Invoice
  const [hoveredBillId, setHoveredBillId] = useState<string | null>(null);
  const [hoveredInvoiceId, setHoveredInvoiceId] = useState<string | null>(null);

  // Estado para accordion de itens do modal
  const [itemsOpen, setItemsOpen] = useState(false);
  // Refs para containers (sem | null no tipo)
  const billsRef = React.useRef<HTMLDivElement>(null);
  const billPaymentsRef = React.useRef<HTMLDivElement>(null);
  const invoicesRef = React.useRef<HTMLDivElement>(null);
  const paymentsRef = React.useRef<HTMLDivElement>(null);

  // Modal estilizado padrão PermitCarousel
  const renderModal = (rel: typeof filteredEstimates[number], itemsOpen: boolean, setItemsOpen: React.Dispatch<React.SetStateAction<boolean>>) => {
    // Agrupar Bill Payments únicos
    const allBillPayments: { id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null }[] = [];
    rel.bills.forEach((b) => {
      if (b.bill_payments && Array.isArray(b.bill_payments)) {
        b.bill_payments.forEach((bp) => {
          if (!allBillPayments.find(x => x.id === bp.id)) allBillPayments.push(bp);
        });
      }
    });
    // Agrupar Payments únicos
    const allPayments = rel.payments;
    // Agrupar Invoices
    const allInvoices = rel.links.filter(l => l.txn_type === 'Invoice');
    // Agrupar Bills
    const allBills = rel.bills;
    // Cores e ícones
    const COLORS = {
      estimate: '#6c757d',
      bill: '#f28b82', // vermelho suave
      billStrong: '#d32f2f', // vermelho forte para texto/borda
      billpayment: '#f28b82',
      invoice: '#a7e9af', // verde suave
      invoiceStrong: '#388e3c', // verde forte para texto/borda
      payment: '#a7e9af',
    };
    const ICONS = {
      estimate: 'bi-clipboard-data',
      invoice: 'bi-receipt',
      payment: 'bi-credit-card',
      bill: 'bi-file-earmark-text',
      billpayment: 'bi-cash-stack',
    };
    // Datas formato americano
    const formatDateUS = (date?: string | null) => {
      if (!date) return '-';
      const d = new Date(date);
      return d.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
    };
    // Linhas conectando containers agora são desenhadas apenas entre os blocos, dentro dos divs invisíveis
    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.25)',
          backdropFilter: 'blur(2px)',
          zIndex: 2147483647,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          transform: 'translateZ(0)',
          willChange: 'z-index',
        }}
        onClick={handleCloseModal}
      >
        <div
          style={{
            background: 'var(--color-background-primary)',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            minWidth: 420,
            maxWidth: 1000,
            color: 'var(--color-text-primary)',
            position: 'relative',
            border: '1px solid var(--color-border-divider)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh',
            pointerEvents: 'auto',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h5 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Resumo do Projeto</span>
            </h5>
            <CloseButton onClick={handleCloseModal} size="md" />
          </div>
          {/* Corpo principal */}
          <div style={{ padding: 24, background: 'var(--color-background-primary)', flex: 1, overflowY: 'auto', position: 'relative' }}>
            {/* Linhas conectando containers agora são desenhadas apenas entre os blocos, dentro dos divs invisíveis */}
            {/* Bloco Estimate */}
            <div style={{ background: COLORS.estimate + '11', border: `1.5px solid ${COLORS.estimate}33`, borderRadius: 10, padding: 18, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className={`bi ${ICONS.estimate}`} style={{ color: COLORS.estimate, fontSize: 22 }} />
                <span style={{ color: COLORS.estimate, fontWeight: 700, fontSize: 18 }}>Estimate</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 15, color: 'var(--color-text-primary)' }}>
                <span><b>Cliente:</b> {getProjectName(rel.estimate.customer_name) || '-'}</span>
                <span><b>Número:</b> {rel.estimate.doc_number || '-'}</span>
                <span><b>Valor:</b> {formatCurrency(rel.estimate.total_amount)}</span>
                <span><b>Status:</b> {rel.estimate.txn_status || '-'}</span>
                <span><b>Data:</b> {formatDateUS(rel.estimate.txn_date)}</span>
              </div>
              {/* Accordion Itens */}
              <div style={{ width: '100%', marginTop: 8 }}>
                <button onClick={() => setItemsOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--color-accent-primary)', fontWeight: 500, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`bi ${itemsOpen ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}`} /> Itens do Estimate
                </button>
                {itemsOpen && (
                  <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 12, marginTop: 6 }}>
                    {rel.lines.length === 0 ? <div style={{ color: 'var(--color-text-secondary)' }}>Nenhum item encontrado.</div> : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {rel.lines.map((l, i) => (
                          <li key={l.id || i}>
                            {l.description || '(Sem descrição)'} | Qtd: {l.quantity !== undefined && l.quantity !== null ? l.quantity : '-'} | Valor: {formatCurrency(l.amount)} | Item: {l.item_ref_name || '-'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Colunas Receitas/Despesas */}
            <div ref={colunasRef} style={{ display: 'flex', flexDirection: 'row', gap: 32, justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              {/* Despesas (Bills/Bill Payments) */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Bills */}
                <div ref={billsRef} style={{
                  background: COLORS.bill + '11',
                  border: `2px solid ${COLORS.billStrong}`,
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  color: undefined,
                  cursor: 'pointer',
                }}
                onClick={e => { e.stopPropagation(); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: COLORS.billStrong, fontWeight: 600, fontSize: 15 }}>
                    <i className={`bi ${ICONS.bill}`} style={{ color: COLORS.billStrong, fontSize: 18 }} />
                    <span>Bills</span>
                  </div>
                  {allBills.length === 0 ? <div style={{ color: 'var(--color-text-secondary)' }}>Nenhum bill relacionado encontrado.</div> : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {allBills.map((b, i) => {
                        const isHovered = hoveredBillId === b.bill.id;
                        return (
                          <li key={b.bill.id || i}
                            style={{ fontWeight: isHovered ? 700 : 400, cursor: 'pointer' }}
                            onMouseEnter={() => { setHoveredBillId(b.bill.id); setHoveredInvoiceId(null); }}
                            onMouseLeave={() => setHoveredBillId(null)}
                          >
                            Bill #{b.bill.doc_number || b.bill.external_id} | Valor: {formatCurrency(b.bill.total_amount)} | Data: {formatDateUS(b.bill.txn_date)}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {/* Linha entre Bills e Pagamentos de Bills */}
                {(() => {
                  const lineRef = React.createRef<HTMLDivElement>();
                  return (
                    <div ref={lineRef} style={{ height: 24, position: 'relative', width: '100%' }}>
                      {allBills.length > 0 && allBillPayments.length > 0 && (
                        <ConnectedLine fromRef={billsRef} toRef={billPaymentsRef} parentRef={lineRef} color={COLORS.billStrong} strokeWidth={2} zIndex={0} />
                      )}
                    </div>
                  );
                })()}
                {/* Bill Payments */}
                <div ref={billPaymentsRef} style={{
                  background: COLORS.billpayment + '11',
                  border: `2px solid ${COLORS.billStrong}`,
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginTop: 0,
                  color: undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: COLORS.billStrong, fontWeight: 600, fontSize: 15 }}>
                    <i className={`bi ${ICONS.billpayment}`} style={{ color: COLORS.billStrong, fontSize: 18 }} />
                    <span>Pagamentos de Bills</span>
                  </div>
                  {allBillPayments.length === 0 ? <div style={{ color: 'var(--color-text-secondary)' }}>Nenhum Bill Payment relacionado.</div> : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {allBillPayments.map((bp, i) => {
                        // Bill Payment está relacionado se algum bill em hover tiver esse payment
                        const isRelated = hoveredBillId && allBills.some(b => b.bill.id === hoveredBillId && b.bill_payments && b.bill_payments.some(p => p.id === bp.id));
                        return (
                          <li key={bp.id || i} style={{ fontWeight: isRelated ? 700 : 400 }}>
                            {bp.doc_number || bp.id} | Valor: {formatCurrency(bp.total_amount)} | Data: {formatDateUS(bp.txn_date)}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              {/* Receitas (Invoices/Payments) */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Invoices */}
                <div ref={invoicesRef} style={{
                  background: COLORS.invoice + '11',
                  border: `2px solid ${COLORS.invoiceStrong}`,
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  color: undefined,
                  cursor: 'pointer',
                }}
                onClick={e => { e.stopPropagation(); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: COLORS.invoiceStrong, fontWeight: 600, fontSize: 15 }}>
                    <i className={`bi ${ICONS.invoice}`} style={{ color: COLORS.invoiceStrong, fontSize: 18 }} />
                    <span>Invoices</span>
                  </div>
                  {allInvoices.length === 0 ? <div style={{ color: 'var(--color-text-secondary)' }}>Nenhum invoice relacionado.</div> : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {allInvoices.map((l, i) => {
                        const isHovered = hoveredInvoiceId === l.id;
                        return (
                          <li key={l.id || i}
                            style={{ fontWeight: isHovered ? 700 : 400, cursor: 'pointer' }}
                            onMouseEnter={() => { setHoveredInvoiceId(l.id); setHoveredBillId(null); }}
                            onMouseLeave={() => setHoveredInvoiceId(null)}
                          >
                            Invoice #{l.txn_id}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {/* Linha entre Invoices e Pagamentos Recebidos */}
                {(() => {
                  const lineRef = React.createRef<HTMLDivElement>();
                  return (
                    <div ref={lineRef} style={{ height: 24, position: 'relative', width: '100%' }}>
                      {allInvoices.length > 0 && allPayments.length > 0 && (
                        <ConnectedLine fromRef={invoicesRef} toRef={paymentsRef} parentRef={lineRef} color={COLORS.invoiceStrong} strokeWidth={2} zIndex={0} />
                      )}
                    </div>
                  );
                })()}
                {/* Payments */}
                <div ref={paymentsRef} style={{
                  background: COLORS.payment + '11',
                  border: `2px solid ${COLORS.invoiceStrong}`,
                  borderRadius: 10,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginTop: 0,
                  color: undefined,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: COLORS.invoiceStrong, fontWeight: 600, fontSize: 15 }}>
                    <i className={`bi ${ICONS.payment}`} style={{ color: COLORS.invoiceStrong, fontSize: 18 }} />
                    <span>Pagamentos Recebidos</span>
                  </div>
                  {allPayments.length === 0 ? <div style={{ color: 'var(--color-text-secondary)' }}>Nenhum payment relacionado.</div> : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {allPayments.map((p, i) => {
                        // Payment está relacionado se algum invoice em hover tiver esse payment
                        const isRelated = hoveredInvoiceId && allInvoices.some(l => l.id === hoveredInvoiceId && rel.payments.some(pay => pay.id === p.id));
                        return (
                          <li key={p.id || i} style={{ fontWeight: isRelated ? 700 : 400 }}>
                            Valor: {formatCurrency(p.total_amount)} | Data: {formatDateUS(p.txn_date)} | Ref: {p.payment_ref || '-'} | Nota: {p.private_note || '-'}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Footer */}
          <div style={{ borderTop: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '16px 24px' }}>
            <button
              type="button"
              onClick={handleCloseModal}
              style={{
                borderRadius: 6,
                fontWeight: 500,
                minWidth: 90,
                padding: '8px 16px',
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-divider)',
                cursor: 'pointer'
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', margin: '20px 0' }}>
      <div className="d-flex flex-row align-items-center justify-content-between mb-2" style={{ gap: 12 }}>
        <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, margin: 0 }}>Accepted Estimates</h4>
        <div className="d-flex flex-row align-items-center gap-2">
          {/* Busca */}
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: searchOpen ? 220 : 42, height: 42, transition: 'width 0.5s', background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: searchOpen ? 25 : 21, padding: searchOpen ? '2px 8px' : '4px', boxSizing: 'border-box' }}>
            <button type="button" className="btn-tertiary-custom d-flex align-items-center justify-content-center" style={{ width: 28, height: 28, fontSize: 16, borderRadius: 14, color: 'var(--color-accent-primary)', background: 'transparent', border: 'none' }} onClick={handleOpenSearch} aria-label="Abrir busca" title="Buscar" tabIndex={searchOpen ? -1 : 0} disabled={searchOpen}>
              <i className="bi bi-search" />
            </button>
            <input id="accepted-estimates-search" type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder={'Buscar cliente, doc...'} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: 15, height: 32, marginLeft: 4, display: searchOpen ? 'block' : 'none', padding: searchOpen ? '0 8px 0 4px' : '0', width: searchOpen ? '100%' : 0, minWidth: 0, opacity: searchOpen ? 1 : 0, pointerEvents: searchOpen ? 'auto' : 'none', transition: 'width 0.5s, opacity 0.3s', outline: 'none', boxSizing: 'border-box' }} onBlur={() => { if (!searchText) handleCloseSearch(); }} tabIndex={searchOpen ? 0 : -1} />
          </div>
          {/* Ordenação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 42 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Ordenar</span>
            <button onClick={() => setSortBy(sortBy === 'date' ? 'total' : sortBy === 'total' ? null : 'date')} style={{ background: sortBy ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', color: sortBy ? '#fff' : 'var(--color-text-secondary)', border: '1px solid var(--color-border-divider)', borderRadius: 15, padding: '4px 10px', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>{sortBy === 'date' ? 'Data' : sortBy === 'total' ? 'Valor' : 'OFF'}</button>
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--color-background-primary)', overflow: 'hidden', width: '100%', flex: '1 1 0%', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '40vh', padding: '0 10px 10px 10px' }}>
        {loading && <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: 15, padding: 20 }}>Carregando estimates...</div>}
        {error && <div style={{ color: 'var(--challenges-color)', fontStyle: 'italic', fontSize: 15, padding: 20 }}>Erro: {error}</div>}
        <div ref={carouselRef} className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'row', gap: 16, overflowX: 'auto', padding: '8px 0 8px 8px', cursor: drag.current.dragging ? 'grabbing' : 'grab', userSelect: 'none', WebkitOverflowScrolling: 'touch', flex: '1 1 0%', minHeight: 0, maxHeight: '100%' }} onMouseDown={onMouseDown}>
          {!loading && !error && filteredEstimates.length === 0 && (
            <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: 15, padding: 20 }}>Nenhum estimate aceito encontrado</div>
          )}
          {filteredEstimates.map((rel, idx) => (
            <div key={rel.estimate.id} style={{ minWidth: 320, maxWidth: 350, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 10, boxShadow: hovered === rel.estimate.id ? '0 4px 16px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative', transition: 'box-shadow 0.2s, border 0.2s', maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }} onMouseEnter={() => setHovered(rel.estimate.id)} onMouseLeave={() => setHovered(null)} onClick={() => handleOpenModal(idx)} title={hovered === rel.estimate.id ? getProjectName(rel.estimate.customer_name) : ''}>
              {/* Cabeçalho */}
              <div style={{ padding: '12px 16px 8px 16px', borderBottom: '1px solid var(--color-border-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: STATUS['Accepted'].color }}>
                    <i className={STATUS['Accepted'].icon} />
                  </span>
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15 }}>Projeto</span>
                </div>
                <span style={{ color: 'var(--color-accent-primary)', fontSize: 18, fontWeight: 500 }}>{rel.estimate.doc_number}</span>
              </div>
              {/* Corpo */}
              <div style={{ padding: '8px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'center' }}>
                <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: 16, textAlign: 'center' }}>{getProjectName(rel.estimate.customer_name)}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 14, textAlign: 'center' }}>Valor: {formatCurrency(rel.estimate.total_amount)}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', justifyContent: 'center' }}>
                  <span title="Data">{formatDate(rel.estimate.txn_date)}</span>
                  <span title="Status">{rel.estimate.txn_status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Modal Detalhado */}
      {modalIdx !== null && filteredEstimates[modalIdx] && renderModal(filteredEstimates[modalIdx], itemsOpen, setItemsOpen)}
    </div>
  );
} 