import React, { useRef, useState, useMemo, useEffect } from 'react';
import ProjectCard from './ProjectCard';
import { useProjectCarouselData } from '../../../hooks/useProjectCarouselData';
import ProjectDetailsModal from './ProjectDetailsModal';
import type { Invoice } from './ProjectDetailsModal';
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
  const [details, setDetails] = useState<{ estimateLines: { id: string; description: string | null; amount: number | null; }[]; expenses: Record<string, unknown>[]; invoices: Invoice[] }>({ estimateLines: [], expenses: [], invoices: [] });

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
          .eq('customer_id', estimateData.customer_id);
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
          .eq('customer_id', estimateData.customer_id);
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
          .eq('customer_id', estimateData.customer_id);
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
      let invoices: Invoice[] = [];
      let backCharges: Invoice[] = [];
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
          id: String(inv.id || inv.external_id || ''),
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
        const depositsAsInvoices: Invoice[] = (depositsData || []).map((deposit: Record<string, unknown>) => ({
          ...deposit,
          id: `deposit_${deposit.id}`,
          doc_number: `DEP-${deposit.doc_number || deposit.external_id}`,
          total_amount: -(Number(deposit.total_amount) || 0),
          txn_date: typeof deposit.txn_date === 'string' ? deposit.txn_date : deposit.txn_date === null ? null : '',
          private_note: typeof deposit.private_note === 'string' ? deposit.private_note : deposit.private_note === null ? null : '',
          payments: [],
          is_deposit: true
        }));

        // Buscar BackCharges (hvac_deposit_lines negativos para o projeto)
        const { data: depositLinesRaw } = await supabase
          .from('hvac_deposit_lines')
          .select('*')
          .eq('customer_id', estimateData.customer_id)
          .eq('customer_name', estimateData.customer_name)
          .lt('amount', 0);
        const depositLines = depositLinesRaw || [];
        // Buscar todos os deposits relacionados aos deposit_lines encontrados
        const depositIds = depositLines.map((line: Record<string, unknown>) => String(line.deposit_id)).filter(Boolean);
        const depositsMap: Record<string, { txn_date?: string | null; private_note?: string | null }> = {};
        if (depositIds.length > 0) {
          const { data: depositsForLinesRaw } = await supabase
            .from('hvac_deposits')
            .select('id, txn_date, private_note')
            .in('id', depositIds);
          (depositsForLinesRaw || []).forEach((dep: { id: string; txn_date?: string | null; private_note?: string | null }) => {
            depositsMap[String(dep.id)] = dep;
          });
        }
        backCharges = depositLines.map((line: Record<string, unknown>) => {
          const dep = depositsMap[String(line.deposit_id)] || {};
          return {
            id: `backcharge_${line.id}`,
            doc_number: `Back Charge - ${line.line_num || line.external_line_id || line.id}`,
            total_amount: Number(line.amount) || 0,
            txn_date: typeof dep.txn_date === 'string' ? dep.txn_date : dep.txn_date === null ? null : '',
            is_backcharge: true,
            description: String(line.description || ''),
            private_note: typeof dep.private_note === 'string' ? dep.private_note : dep.private_note === null ? null : '',
            payments: [],
          } as Invoice;
        });

        // Combinar invoices, deposits e backcharges
        invoices = ([] as Invoice[]).concat(invoices, depositsAsInvoices, backCharges);
      }

      setDetails({ estimateLines: estimateLines as { id: string; description: string | null; amount: number | null; }[], expenses, invoices });
      setLoading(false);
    })();
  }, [estimateId]);

  return { ...details, loading };
}

// Função utilitária para buscar e somar expenses detalhadas de um projeto
async function fetchExpensesTotal(estimateId: string): Promise<number> {
  // Buscar dados detalhados igual ao modal
  const { data: estimateData } = await supabase
    .from('hvac_estimates')
    .select('customer_id, customer_name, external_id')
    .eq('id', estimateId)
    .single();
  if (!estimateData) return 0;
  // Bills
  const { data: billLinesRaw } = await supabase
    .from('hvac_bill_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const billLines = billLinesRaw || [];
  // Purchases
  const { data: purchaseLinesRaw } = await supabase
    .from('hvac_purchase_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const purchaseLines = purchaseLinesRaw || [];
  // Vendor credits
  const { data: vendorCreditLinesRaw } = await supabase
    .from('hvac_vendor_credit_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const vendorCreditLines = vendorCreditLinesRaw || [];
  // Soma todos os amounts
  const total = [...billLines, ...purchaseLines, ...vendorCreditLines].reduce((sum, l) => sum + Number(l.amount || 0), 0);
  return total;
}

// Função utilitária para buscar e somar invoices e backcharges detalhados de um projeto
async function fetchInvoicesTotal(estimateId: string): Promise<number> {
  // Buscar dados detalhados igual ao modal
  const { data: estimateData } = await supabase
    .from('hvac_estimates')
    .select('customer_id, customer_name, external_id')
    .eq('id', estimateId)
    .single();
  if (!estimateData) return 0;
  // Invoices
  const { data: invoicesDataRaw } = await supabase
    .from('hvac_invoices')
    .select('*')
    .eq('customer_id', estimateData.customer_id);
  const invoicesData = invoicesDataRaw || [];
  // Deposits (BackCharges)
  const { data: depositLinesRaw } = await supabase
    .from('hvac_deposit_lines')
    .select('*')
    .eq('customer_id', estimateData.customer_id)
    .eq('customer_name', estimateData.customer_name)
    .lt('amount', 0);
  const depositLines = depositLinesRaw || [];
  // Soma invoices
  const invoicesTotal = invoicesData.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  // Soma backcharges (amount já é negativo)
  const backChargesTotal = depositLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  // Total recebido = invoices + backcharges (backcharges são negativos)
  return invoicesTotal + backChargesTotal;
}

interface AcceptedEstimatesCarouselProps {
  selectedYear: string;
  selectedMonth: string;
}

export default function AcceptedEstimatesCarousel({ selectedYear, selectedMonth }: AcceptedEstimatesCarouselProps) {
  // Filtros editáveis
  const [onlyAccepted, setOnlyAccepted] = useState(true);
  
  // SEMPRE buscar TODOS os dados do SQL, sem filtros de data
  const { data: carouselData, loading: carouselLoading, error } = useProjectCarouselData({
    dateFrom: '', // String vazia para buscar todos os dados
    dateTo: '',   // String vazia para buscar todos os dados
    onlyAccepted
  });

  // Adicionar estilos CSS para animações
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = spinnerStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Novo estado para armazenar os totais detalhados de expenses
  const [expensesTotals, setExpensesTotals] = useState<{ [estimateId: string]: number }>({});
  const [expensesLoading, setExpensesLoading] = useState(false);
  // Buscar os totais detalhados assim que os estimates mudarem
  useEffect(() => {
    if (!carouselData || carouselData.length === 0) return;
    let cancelled = false;
    async function fetchAll() {
      setExpensesLoading(true);
      const totals: { [estimateId: string]: number } = {};
      await Promise.all(carouselData.map(async (estimate) => {
        totals[estimate.estimate_id] = await fetchExpensesTotal(estimate.estimate_id);
      }));
      if (!cancelled) {
        setExpensesTotals(totals);
        setExpensesLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [carouselData]);

  // Novo estado para armazenar os totais detalhados de invoices
  const [invoicesTotals, setInvoicesTotals] = useState<{ [estimateId: string]: number }>({});
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  // Buscar os totais detalhados assim que os estimates mudarem
  useEffect(() => {
    if (!carouselData || carouselData.length === 0) return;
    let cancelled = false;
    async function fetchAll() {
      setInvoicesLoading(true);
      const totals: { [estimateId: string]: number } = {};
      await Promise.all(carouselData.map(async (estimate) => {
        totals[estimate.estimate_id] = await fetchInvoicesTotal(estimate.estimate_id);
      }));
      if (!cancelled) {
        setInvoicesTotals(totals);
        setInvoicesLoading(false);
      }
    }
    fetchAll();
    return () => { cancelled = true; };
  }, [carouselData]);

  // Loading geral - só mostrar conteúdo quando tudo estiver carregado
  const isLoading = carouselLoading || expensesLoading || invoicesLoading;

  const [hovered, setHovered] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'profit' | 'markup' | null>('profit');
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

    // Filtro por data no frontend usando as datas calculadas
    if (selectedYear || selectedMonth) {
      filtered = filtered.filter(estimate => {
        if (!estimate.estimate_date) return false;
        
        const estimateDate = new Date(estimate.estimate_date);
        const estimateYear = estimateDate.getFullYear().toString();
        const estimateMonth = (estimateDate.getMonth() + 1).toString().padStart(2, '0');
        
        // Se ano e mês estão selecionados
        if (selectedYear && selectedMonth) {
          return estimateYear === selectedYear && estimateMonth === selectedMonth;
        }
        // Se apenas ano está selecionado
        else if (selectedYear) {
          return estimateYear === selectedYear;
        }
        
        return true;
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
    } else if (sortBy === 'profit') {
      filtered = [...filtered].sort((a, b) => {
        const profitA = (invoicesTotals[a.estimate_id] ?? 0) - (expensesTotals[a.estimate_id] ?? 0);
        const profitB = (invoicesTotals[b.estimate_id] ?? 0) - (expensesTotals[b.estimate_id] ?? 0);
        return sortDirection === 'desc' ? profitB - profitA : profitA - profitB;
      });
    } else if (sortBy === 'markup') {
      filtered = [...filtered].sort((a, b) => {
        const invoicesA = invoicesTotals[a.estimate_id] ?? 0;
        const expensesA = expensesTotals[a.estimate_id] ?? 0;
        const profitA = invoicesA - expensesA;
        const markupA = invoicesA > 0 ? (profitA / invoicesA) * 100 : 0;
        
        const invoicesB = invoicesTotals[b.estimate_id] ?? 0;
        const expensesB = expensesTotals[b.estimate_id] ?? 0;
        const profitB = invoicesB - expensesB;
        const markupB = invoicesB > 0 ? (profitB / invoicesB) * 100 : 0;
        
        return sortDirection === 'desc' ? markupB - markupA : markupA - markupB;
      });
    }

    // Filtrar para customerIds únicos
    const seen = new Set();
    filtered = filtered.filter(item => {
      if (!item.customer_id) return false;
      if (seen.has(item.customer_id)) return false;
      seen.add(item.customer_id);
      return true;
    });

    return filtered;
  }, [carouselData, sortBy, sortDirection, searchTerm, invoicesTotals, expensesTotals, selectedYear, selectedMonth]);

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



  // Modal Detalhado
  const estimateId = modalIdx !== null && filteredEstimates[modalIdx] ? filteredEstimates[modalIdx].estimate_id : null;
  const { estimateLines, expenses, invoices, loading: modalLoading } = useProjectDetails(estimateId);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-background-primary)' }}>
      {/* Título fixo */}
      <div style={{ borderTop: '1px solid var(--color-border-divider)', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <div className='d-flex justify-content-between align-items-center' style={{ padding: '12px 32px', background: 'var(--color-background-primary)' }}>
          <h4 style={{ color: 'var(--color-text-secondary)', fontSize: 18, fontWeight: 400, margin: 0 }}>Project Information</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 38 }}>
            {/* Filtro Just Accepted */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-background-secondary)', borderRadius: 19, padding: '0 6px 0 12px', height: 38, boxSizing: 'border-box', boxShadow: '0 1px 4px rgba(0,0,0,0.03)', border: '1px solid var(--color-border-divider)' }}>
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
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14, fontWeight: 500 }}>Order by</span>
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
                    if (sortBy === 'profit') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortBy('profit');
                      setSortDirection('desc');
                    }
                  }} 
                  style={{ 
                    background: sortBy === 'profit' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                    color: sortBy === 'profit' ? '#fff' : 'var(--color-text-secondary)', 
                    border: sortBy === 'profit' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)', 
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
                  Profit
                  {sortBy === 'profit' && (
                    <i className={`bi bi-arrow-${sortDirection === 'desc' ? 'down' : 'up'}`} style={{ fontSize: 10 }} />
                  )}
                </button>
                
                <button
                  onClick={() => {
                    if (sortBy === 'markup') {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortBy('markup');
                      setSortDirection('desc');
                    }
                  }} 
                  style={{ 
                    background: sortBy === 'markup' ? 'var(--color-accent-primary)' : 'var(--color-background-primary)', 
                    color: sortBy === 'markup' ? '#fff' : 'var(--color-text-secondary)', 
                    border: sortBy === 'markup' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-divider)', 
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
                  Markup
                  {sortBy === 'markup' && (
                    <i className={`bi bi-arrow-${sortDirection === 'desc' ? 'down' : 'up'}`} style={{ fontSize: 10 }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Conteúdo principal centralizado e responsivo */}
      <div style={{ width: '100%', height: '420px', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-background-primary)', overflow: 'hidden', boxSizing: 'border-box', position: 'relative' }}>
        {isLoading && (
          <div style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'var(--color-background-primary)',
            zIndex: 10,
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
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Carregando projetos...</span>
            </div>
          </div>
        )}
        {error && <div style={{ color: 'var(--challenges-color)', fontStyle: 'italic', fontSize: 15, padding: 20 }}>Erro: {error}</div>}
        <div ref={carouselRef} className="custom-scrollbar px-4" style={{ 
          display: 'flex', 
          flexDirection: 'row', 
          gap: 20, 
          overflowX: 'auto', 
          overflowY: 'hidden', 
          cursor: drag.current.dragging ? 'grabbing' : 'grab', 
          userSelect: 'none', 
          WebkitOverflowScrolling: 'touch', 
          flex: 1, 
          minHeight: 0, 
          height: '100%', 
          boxSizing: 'border-box', 
          alignItems: 'center',
          padding: '20px 32px'
        }} onMouseDown={onMouseDown}>
          {!isLoading && !error && filteredEstimates.length === 0 && (
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
              estimateTotal={estimate.estimate_total || 0}
              invoicesTotal={invoicesTotals[estimate.estimate_id] ?? 0}
              expensesTotal={expensesTotals[estimate.estimate_id] ?? 0}
              expenseCount={estimate.expense_count || 0}
              invoiceCount={estimate.invoice_count || 0}
              paymentsMadeCount={estimate.payments_made_count || 0}
              paymentsReceivedCount={estimate.payments_received_count || 0}
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
          estimateLines={estimateLines as { id: string; description: string | null; amount: number | null; }[]}
          expenses={expenses}
          invoices={invoices}
          loading={modalLoading}
        />
      )}
    </div>
  );
} 