import React, { useRef, useState, useMemo, useEffect } from 'react';
import dayjs from 'dayjs';
import ProjectCard from './ProjectCard';
import { useProjectCarouselData } from '../../../hooks/useProjectCarouselData';
import ProjectDetailsModal from './ProjectDetailsModal';
import { supabase } from '../../../supabaseClient';

// Estilos CSS para animações
const spinnerStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;



// 1. Trocar todas as exibições de valores para dólar (USD)
function getProjectName(rawName?: string | null) {
  if (!rawName) return '';
  const parts = rawName.split(':');
  return parts[parts.length - 1].trim();
}

// Tipos genéricos para dados vindos do Supabase
// Usar Record<string, unknown> para evitar erro de tipagem

function useProjectDetails(estimateId: string | null) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<{ estimateLines: Record<string, unknown>[]; expenses: Record<string, unknown>[]; invoices: Record<string, unknown>[] }>({ estimateLines: [], expenses: [], invoices: [] });

  useEffect(() => {
    setDetails({ estimateLines: [], expenses: [], invoices: [] });
    if (!estimateId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      // Buscar linhas do estimate
      const { data: estimateLinesRaw } = await supabase
        .from('hvac_estimate_lines')
        .select('*')
        .eq('estimate_id', estimateId);
      const estimateLines = estimateLinesRaw || [];

      // Buscar dados do estimate
      const { data: estimateData } = await supabase
        .from('hvac_estimates')
        .select('customer_id, customer_name, external_id')
        .eq('id', estimateId)
        .single();

      let expenses: Record<string, unknown>[] = [];
      if (estimateData) {
        // 1. Buscar bills relacionadas ao estimate
        const { data: billLinesRaw } = await supabase
          .from('hvac_bill_lines')
          .select('*')
          .or(`customer_id.eq.${estimateData.customer_id},customer_name.eq.${estimateData.customer_name}`);
        const billLines = billLinesRaw || [];
        const billIds = [...new Set((billLines || []).map((l: Record<string, unknown>) => l.bill_id))];
        const { data: billsDataRaw } = billIds.length > 0 ? await supabase
          .from('hvac_bills')
          .select('*')
          .in('id', billIds) : { data: [] };
        const billsData = billsDataRaw || [];
        
        // Buscar bill payments para bills
        const { data: billPaymentLinksRaw } = (billsData && billsData.length > 0) ? await supabase
          .from('hvac_bill_payment_links')
          .select('*')
          .in('txn_id', billsData.map((b: Record<string, unknown>) => b.external_id)) : { data: [] };
        const billPaymentLinks = billPaymentLinksRaw || [];
        const billPaymentIds = [...new Set((billPaymentLinks || []).map((l: Record<string, unknown>) => l.bill_payment_id))];
        const { data: billPaymentsRaw } = billPaymentIds.length > 0 ? await supabase
          .from('hvac_bill_payments')
          .select('*')
          .in('id', billPaymentIds) : { data: [] };
        const billPayments = billPaymentsRaw || [];

        // 2. Buscar purchases relacionadas ao estimate
        const { data: purchaseLinesRaw } = await supabase
          .from('hvac_purchase_lines')
          .select('*')
          .or(`customer_id.eq.${estimateData.customer_id},customer_name.eq.${estimateData.customer_name}`);
        const purchaseLines = purchaseLinesRaw || [];
        const purchaseIds = [...new Set((purchaseLines || []).map((l: Record<string, unknown>) => l.purchase_id))];
        const { data: purchasesDataRaw } = purchaseIds.length > 0 ? await supabase
          .from('hvac_purchases')
          .select('*')
          .in('id', purchaseIds) : { data: [] };
        const purchasesData = purchasesDataRaw || [];

        // 3. Buscar vendor credits relacionados ao estimate
        const { data: vendorCreditLinesRaw } = await supabase
          .from('hvac_vendor_credit_lines')
          .select('*')
          .or(`customer_id.eq.${estimateData.customer_id},customer_name.eq.${estimateData.customer_name}`);
        const vendorCreditLines = vendorCreditLinesRaw || [];
        const vendorCreditIds = [...new Set((vendorCreditLines || []).map((l: Record<string, unknown>) => l.vendor_credit_id))];
        const { data: vendorCreditsDataRaw } = vendorCreditIds.length > 0 ? await supabase
          .from('hvac_vendor_credits')
          .select('*')
          .in('id', vendorCreditIds) : { data: [] };
        const vendorCreditsData = vendorCreditsDataRaw || [];

        // Combinar todas as expenses
        const bills = (billsData || []).map((bill: Record<string, unknown>) => ({
          ...bill,
          expense_type: 'bill',
          lines: (billLines || []).filter((l: Record<string, unknown>) => l.bill_id === bill.id),
          bill_payments: (billPaymentLinks || [])
            .filter((link: Record<string, unknown>) => link.txn_id === bill.external_id)
            .map((link: Record<string, unknown>) => (billPayments || []).find((bp: Record<string, unknown>) => bp.id === link.bill_payment_id)).filter(Boolean)
        }));

        const purchases = (purchasesData || []).map((purchase: Record<string, unknown>) => ({
          ...purchase,
          expense_type: 'purchase',
          lines: (purchaseLines || []).filter((l: Record<string, unknown>) => l.purchase_id === purchase.id),
          bill_payments: [] // Purchases não têm bill_payments
        }));

        const vendorCredits = (vendorCreditsData || []).map((vendorCredit: Record<string, unknown>) => ({
          ...vendorCredit,
          expense_type: 'vendor_credit',
          lines: (vendorCreditLines || []).filter((l: Record<string, unknown>) => l.vendor_credit_id === vendorCredit.id),
          bill_payments: [] // Vendor credits não têm bill_payments
        }));

        expenses = [...bills, ...purchases, ...vendorCredits];
      }

      // Buscar invoices relacionadas ao estimate (por customer_id)
      let invoices: Record<string, unknown>[] = [];
      if (estimateData) {
        const { data: invoicesDataRaw } = await supabase
          .from('hvac_invoices')
          .select('*')
          .eq('customer_id', estimateData.customer_id);
        const invoicesData = invoicesDataRaw || [];
        const invoiceExternalIds = (invoicesData || []).map((inv: Record<string, unknown>) => inv.external_id);
        const { data: paymentLinksRaw } = invoiceExternalIds.length > 0 ? await supabase
          .from('hvac_payment_links')
          .select('*')
          .in('txn_id', invoiceExternalIds) : { data: [] };
        const paymentLinks = paymentLinksRaw || [];
        const paymentIds = [...new Set((paymentLinks || []).map((l: Record<string, unknown>) => l.payment_id).filter(Boolean))];
        const { data: paymentsRaw } = paymentIds.length > 0 ? await supabase
          .from('hvac_payments')
          .select('*')
          .in('id', paymentIds) : { data: [] };
        const payments = paymentsRaw || [];
        invoices = (invoicesData || []).map((inv: Record<string, unknown>) => ({
          ...inv,
          payments: (paymentLinks || [])
            .filter((link: Record<string, unknown>) => link.txn_id === inv.external_id)
            .map((link: Record<string, unknown>) => (payments || []).find((p: Record<string, unknown>) => p.id === link.payment_id)).filter(Boolean)
        }));

        // Buscar deposits (ressarcimentos) relacionados ao estimate (por customer_id)
        const { data: depositsDataRaw } = await supabase
          .from('hvac_deposits')
          .select('*')
          .eq('customer_id', estimateData.customer_id);
        const depositsData = depositsDataRaw || [];
        
        // Adicionar deposits como "invoices negativas" (ressarcimentos)
        const depositsAsInvoices = (depositsData || []).map((deposit: Record<string, unknown>) => ({
          ...deposit,
          id: `deposit_${deposit.id}`, // Prefixo para identificar como deposit
          doc_number: `DEP-${deposit.doc_number || deposit.external_id}`, // Prefixo DEP para identificar
          total_amount: -(Number(deposit.total_amount) || 0), // Valor negativo (ressarcimento)
          txn_date: deposit.txn_date,
          private_note: deposit.private_note,
          payments: [], // Deposits não têm payments
          is_deposit: true // Flag para identificar como deposit
        }));

        // Combinar invoices e deposits
        invoices = [...invoices, ...depositsAsInvoices];
      }

      setDetails({ estimateLines, expenses, invoices });
      setLoading(false);
    })();
  }, [estimateId]);

  return { ...details, loading };
}

export default function AcceptedEstimatesCarousel() {
  // Definir datas padrão (ano atual)
  const now = dayjs();
  const defaultStartOfYear = now.startOf('year').format('YYYY-MM-DD');
  const defaultToday = now.format('YYYY-MM-DD');
  
  // Filtros editáveis
  const [onlyAccepted, setOnlyAccepted] = useState(true);
  const [dateFrom, setDateFrom] = useState(defaultStartOfYear);
  const [dateTo, setDateTo] = useState(defaultToday);
  
  // Sempre que a página abrir, setar datas para 01/01/ano atual até hoje
  useEffect(() => {
    const now = dayjs();
    const startOfYear = now.startOf('year').format('YYYY-MM-DD');
    const today = now.format('YYYY-MM-DD');
    setDateFrom(startOfYear);
    setDateTo(today);
  }, []);

  // Adicionar estilos CSS para animações
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = spinnerStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  
  // Usar o hook otimizado que chama a função SQL
  const { data: carouselData, loading, error } = useProjectCarouselData({
    dateFrom,
    dateTo,
    onlyAccepted
  });

  const [hovered, setHovered] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'name' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const carouselRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const drag = useRef({ x: 0, scroll: 0, dragging: false });

  // Busca e ordenação
  const filteredEstimates = useMemo(() => {
    if (!carouselData) return [];

    // Filtro por texto
    let filtered = carouselData;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(estimate => {
        const projectName = getProjectName(estimate.project_name).toLowerCase();
        const customerName = (estimate.project_name || '').toLowerCase();
        const customerId = (estimate.customer_id || '').toLowerCase();
        return projectName.includes(term) || customerName.includes(term) || customerId.includes(term);
      });
    }
    
    // Ordenação
    if (sortBy === 'date') {
      filtered = [...filtered].sort((a, b) => {
        const dateA = new Date(a.estimate_date || '').getTime();
        const dateB = new Date(b.estimate_date || '').getTime();
        return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
      });
    } else if (sortBy === 'total') {
      filtered = [...filtered].sort((a, b) => {
        const totalA = a.estimate_total || 0;
        const totalB = b.estimate_total || 0;
        return sortDirection === 'desc' ? totalB - totalA : totalA - totalB;
      });
    } else if (sortBy === 'name') {
      filtered = [...filtered].sort((a, b) => {
        const nameA = getProjectName(a.project_name).toLowerCase();
        const nameB = getProjectName(b.project_name).toLowerCase();
        return sortDirection === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      });
    }
    return filtered;
  }, [carouselData, sortBy, sortDirection, searchTerm]);

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
      searchInputRef.current?.focus();
    }, 100);
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchTerm('');
  };

  // Função para abrir o modal detalhado
  function handleOpenModal(idx: number) {
    setModalIdx(idx);
  }

  function handleCloseModal() {
    setModalIdx(null);
  }

  // Handler para filtro de datas
  const handleDateChange = (type: 'from' | 'to', value: string) => {
    if (type === 'from') setDateFrom(value);
    if (type === 'to') setDateTo(value);
  };

  // Modal Detalhado
  const estimateId = modalIdx !== null && filteredEstimates[modalIdx] ? filteredEstimates[modalIdx].estimate_id : null;
  const { estimateLines, expenses, invoices, loading: modalLoading } = useProjectDetails(estimateId);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)' }}>
      {/* Título fixo */}
      <div style={{ borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <div className='d-flex justify-content-between align-items-center' style={{ padding: '12px 32px', background: 'var(--color-background-primary)' }}>
          <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, margin: 0 }}>Project Information</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 38 }}>
            {/* Filtros agrupados visualmente */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--color-background-secondary)', borderRadius: 19, padding: '0 6px 0 12px', height: 38, boxSizing: 'border-box', boxShadow: '0 1px 4px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-divider)', justifyContent: 'space-between' }}>
              {/* Toggle booleano padrão contábil */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 15, padding: 0, height: 38 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Just Accepted</span>
                <button
                  type="button"
                  onClick={() => setOnlyAccepted(v => !v)}
                  style={{
                    background: onlyAccepted ? 'var(--color-accent-primary)' : 'var(--color-background-primary)',
                    color: onlyAccepted ? '#fff' : 'var(--color-accent-primary)',
                    border: onlyAccepted ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)',
                    borderRadius: 15,
                    padding: '4px 18px',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    height: 26,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 60,
                    outline: 'none',
                    boxShadow: onlyAccepted ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                    opacity: 1
                  }}
                  title="Alternar apenas Accepted"
                  onMouseEnter={e => {
                    if (!onlyAccepted) {
                      e.currentTarget.style.background = 'var(--color-background-primary)';
                      e.currentTarget.style.color = 'var(--color-accent-primary)';
                      e.currentTarget.style.border = '1px solid var(--color-accent-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = onlyAccepted ? 'var(--color-accent-primary)' : 'var(--color-background-primary)';
                    e.currentTarget.style.color = onlyAccepted ? '#fff' : 'var(--color-accent-primary)';
                    e.currentTarget.style.border = onlyAccepted ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)';
                  }}
                >
                  {onlyAccepted ? 'ON' : 'OFF'}
                </button>
              </div>
              {/* Filtro de datas moderno */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500 }}>De</span>
                <input type="date" value={dateFrom} onChange={e => handleDateChange('from', e.target.value)} lang="en-US" style={{ fontSize: 14, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none', height: 26, boxSizing: 'border-box', fontWeight: 500 }} />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500 }}>até</span>
                <input type="date" value={dateTo} onChange={e => handleDateChange('to', e.target.value)} lang="en-US" style={{ fontSize: 14, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none', height: 26, boxSizing: 'border-box', fontWeight: 500 }} />
              </div>
            </div>
            {/* Busca */}
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
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar projetos..."
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
                onBlur={() => { if (!searchTerm) handleCloseSearch(); }}
                tabIndex={searchOpen ? 0 : -1}
              />
            </div>

            {/* Ordenação */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 25, padding: '6px 6px 6px 15px', border: '1px solid var(--color-border-divider)', height: 38 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Ordenar</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button 
                  onClick={() => {
                    if (sortBy === 'date') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortBy('date');
                      setSortDirection('desc');
                    }
                  }} 
                  style={{
                    background: sortBy === 'date' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                    color: sortBy === 'date' ? '#fff' : 'var(--color-text-secondary)', 
                    border: sortBy === 'date' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)', 
                    borderRadius: 15, 
                    padding: '4px 12px', 
                    fontSize: 13, 
                    cursor: 'pointer', 
                    display: 'flex',
                    alignItems: 'center', 
                    gap: 4,
                    transition: 'all 0.2s', 
                    height: 26, 
                    minWidth: 50, 
                    fontWeight: 600 
                  }}
                >
                  Data
                  {sortBy === 'date' && (
                    <i className={`bi bi-arrow-${sortDirection === 'desc' ? 'down' : 'up'}`} style={{ fontSize: 10 }} />
                  )}
                </button>
                
                <button 
                  onClick={() => {
                    if (sortBy === 'total') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortBy('total');
                      setSortDirection('desc');
                    }
                  }} 
                  style={{ 
                    background: sortBy === 'total' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                    color: sortBy === 'total' ? '#fff' : 'var(--color-text-secondary)', 
                    border: sortBy === 'total' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)', 
                    borderRadius: 15, 
                    padding: '4px 12px', 
                    fontSize: 13, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 4,
                    transition: 'all 0.2s', 
                    height: 26, 
                    minWidth: 50, 
                    fontWeight: 600 
                  }}
                >
                  Valor
                  {sortBy === 'total' && (
                    <i className={`bi bi-arrow-${sortDirection === 'desc' ? 'down' : 'up'}`} style={{ fontSize: 10 }} />
                  )}
                </button>
                
                <button 
                  onClick={() => {
                    if (sortBy === 'name') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortBy('name');
                      setSortDirection('asc');
                    }
                  }} 
                  style={{ 
                    background: sortBy === 'name' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                    color: sortBy === 'name' ? '#fff' : 'var(--color-text-secondary)', 
                    border: sortBy === 'name' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)', 
                    borderRadius: 15, 
                    padding: '4px 12px', 
                    fontSize: 13, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 4,
                    transition: 'all 0.2s', 
                    height: 26, 
                    minWidth: 50, 
                    fontWeight: 600 
                  }}
                >
                  Nome
                  {sortBy === 'name' && (
                    <i className={`bi bi-arrow-${sortDirection === 'desc' ? 'down' : 'up'}`} style={{ fontSize: 10 }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Conteúdo principal centralizado e responsivo */}
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-background-primary)', overflow: 'hidden', boxSizing: 'border-box', height: 'calc(100vh - 140px)' }}>
        {loading && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%', 
            color: 'var(--color-text-secondary)' 
          }}>
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: 12 
            }}>
              <div style={{
                width: 32,
                height: 32,
                border: '3px solid var(--color-border-divider)',
                borderTop: '3px solid var(--color-accent-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Carregando projetos...</span>
            </div>
          </div>
        )}
        {error && <div style={{ color: 'var(--challenges-color)', fontStyle: 'italic', fontSize: 15, padding: 20 }}>Erro: {error}</div>}
        <div ref={carouselRef} className="custom-scrollbar px-3" style={{ display: 'flex', flexDirection: 'row', gap: 12, overflowX: 'auto', overflowY: 'hidden', cursor: drag.current.dragging ? 'grabbing' : 'grab', userSelect: 'none', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0, height: '100%', boxSizing: 'border-box', alignItems: 'center' }} onMouseDown={onMouseDown}>
          {!loading && !error && filteredEstimates.length === 0 && (
            <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', fontSize: 15, padding: 20 }}>Nenhum projeto encontrado</div>
          )}
          {filteredEstimates.map((estimate, idx) => (
            <ProjectCard
              key={estimate.estimate_id}
              id={estimate.estimate_id}
              customerName={estimate.project_name}
              customerId={estimate.customer_id}
              status={estimate.status}
              date={estimate.estimate_date}
              totalAmount={estimate.estimate_total}
              expenseCount={estimate.expense_count}
              invoiceCount={estimate.invoice_count}
              paymentsMadeCount={estimate.payments_made_count}
              paymentsReceivedCount={estimate.payments_received_count}
              hovered={hovered === estimate.estimate_id}
              onHover={setHovered}
              onClick={() => handleOpenModal(idx)}
            />
          ))}
        </div>
      </div>
      {/* Modal Detalhado */}
      {modalIdx !== null && filteredEstimates[modalIdx] && (
        <ProjectDetailsModal
          open={modalIdx !== null}
          onClose={handleCloseModal}
          projectName={filteredEstimates[modalIdx].project_name}
          customerId={filteredEstimates[modalIdx].customer_id}
          estimateDate={filteredEstimates[modalIdx].estimate_date}
          estimateTotal={filteredEstimates[modalIdx].estimate_total}
          estimateLines={estimateLines as Record<string, unknown>[]}
          expenses={expenses as Record<string, unknown>[]}
          invoices={invoices as Record<string, unknown>[]}
          loading={modalLoading}
        />
      )}
    </div>
  );
} 