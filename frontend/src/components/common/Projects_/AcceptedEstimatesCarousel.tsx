import React, { useRef, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useQuickbooksData from '../../../hooks/useQuickbooksData';
import CloseButton from '../../../utils/CloseButton';
import dayjs from 'dayjs';
import type {
  HvacEstimate,
  HvacBill,
  HvacBillPayment,
  HvacBillPaymentLink,
  HvacBillLink,
  HvacInvoice,
  HvacPayment,
  HvacPaymentLink
} from '../../../hooks/useQuickbooksData';

// Estilos CSS para animações
const spinnerStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const STATUS = {
  'Accepted': { color: '#1bbf5c', icon: 'bi-check-circle-fill' },
  'Pending': { color: '#ffc107', icon: 'bi-clock-fill' },
  'Rejected': { color: '#dc3545', icon: 'bi-x-circle-fill' },
};

// 1. Trocar todas as exibições de valores para dólar (USD)
const formatCurrency = (amount?: number | null) => {
  if (typeof amount !== 'number' || isNaN(amount)) return '$0.00';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

function getProjectName(rawName?: string | null) {
  if (!rawName) return '';
  const parts = rawName.split(':');
  return parts[parts.length - 1].trim();
}

// Definir tipo InvoiceType no topo
interface PaymentType {
  id: string;
  total_amount?: number | null;
  txn_date?: string | null;
  payment_ref?: string | null;
  private_note?: string | null;
}
interface InvoiceType {
  id: string;
  doc_number?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
  balance?: number | null;
  payments?: PaymentType[];
}

// Copiado de useQuickbooksData.ts
interface EstimateRelational {
  estimate: {
    id: string;
    doc_number: string | null;
    txn_date: string | null;
    txn_status: string | null;
    customer_id: string | null;
    customer_name: string | null;
    total_amount: number | null;
    external_id: string | null;
  };
  lines: { id: string; estimate_id: string; description: string | null; amount: number | null; quantity?: number | null; item_ref_name?: string | null; customer_id?: string | null; customer_name?: string | null; bill_id?: string }[];
  links: { id: string; estimate_id: string; txn_id: string; txn_type: string | null }[];
  bills: { bill: { id: string; doc_number?: string | null; external_id?: string | null; total_amount?: number | null; txn_date?: string | null }; lines: { id: string; estimate_id?: string; description: string | null; amount: number | null; quantity?: number | null; item_ref_name?: string | null; customer_id?: string | null; customer_name?: string | null; bill_id?: string }[]; bill_payments: { id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null }[] }[];
  payments: { id: string; total_amount: number | null; txn_date: string | null; payment_ref: string | null; private_note: string | null }[];
}

// Tipo auxiliar para acessar invoices corretamente
type AcceptedEstimateRelWithInvoices = EstimateRelational & { invoices?: InvoiceType[] };

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
  
  const {
    data,
    loading,
    error,
    reload
  } = useQuickbooksData();

  type BillRelType = {
    bill: { id: string; doc_number?: string | null; external_id?: string | null; total_amount?: number | null; txn_date?: string | null };
    lines: { id: string; estimate_id?: string; description: string | null; amount: number | null; quantity?: number | null; item_ref_name?: string | null; customer_id?: string | null; customer_name?: string | null; bill_id?: string; account_ref_name?: string | null }[];
    bill_payments: { id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null; private_note?: string | null }[];
  };
  interface EstimateRelType {
    estimate: {
      id: string;
      doc_number: string | null;
      txn_date: string | null;
      txn_status: string | null;
      customer_id: string | null;
      customer_name: string | null;
      total_amount: number | null;
      external_id: string | null;
    };
    lines: { id: string; estimate_id: string; description: string | null; amount: number | null }[];
    links: [];
    bills: BillRelType[];
    payments: HvacPayment[];
    invoices: InvoiceType[];
  }
  const estimatesRel: EstimateRelType[] = useMemo(() => {
    if (!data) return [];


    // Não usar normalização nem map. Filtrar diretamente as bill lines pelo customer do estimate.
    // Map de bills por id
    const billsById = new Map<string, HvacBill>();
    data.hvac_bills.forEach((bill: HvacBill) => {
      billsById.set(bill.id, bill);
    });
    // Agrupar invoices por customer_id + customer_name
    const invoicesByCustomer = new Map<string, HvacInvoice[]>();
    data.hvac_invoices.forEach((inv: HvacInvoice) => {
      if (!inv.customer_id || !inv.customer_name) return;
      const key = inv.customer_id + '|' + inv.customer_name;
      if (!invoicesByCustomer.has(key)) invoicesByCustomer.set(key, []);
      invoicesByCustomer.get(key)!.push(inv);
    });
    // Agrupar payment_links por txn_id e txn_type
    const paymentLinksByTxnIdType = new Map<string, HvacPaymentLink[]>();
    data.hvac_payment_links.forEach((link: HvacPaymentLink) => {
      if (!link.txn_id || !link.txn_type) return;
      const key = link.txn_id + '|' + link.txn_type;
      if (!paymentLinksByTxnIdType.has(key)) paymentLinksByTxnIdType.set(key, []);
      paymentLinksByTxnIdType.get(key)!.push(link);
    });
    // Map de payments por id
    const paymentsById = new Map<string, HvacPayment>();
    data.hvac_payments.forEach((p: HvacPayment) => {
      paymentsById.set(p.id, p);
    });
    // Map de bill_payments por id
    const billPaymentsById = new Map<string, HvacBillPayment>();
    data.hvac_bill_payments.forEach((bp: HvacBillPayment) => {
      billPaymentsById.set(bp.id, bp);
    });
    // Agrupar bill_payment_links por txn_id
    const billPaymentLinksByTxnId = new Map<string, HvacBillPaymentLink[]>();
    data.hvac_bill_payment_links.forEach((link: HvacBillPaymentLink) => {
      if (!link.txn_id) return;
      if (!billPaymentLinksByTxnId.has(link.txn_id)) billPaymentLinksByTxnId.set(link.txn_id, []);
      billPaymentLinksByTxnId.get(link.txn_id)!.push(link);
    });
    // Agrupar bill_links por txn_id (para conectar bills com estimates)
    const billLinksByTxnId = new Map<string, HvacBillLink[]>();
    data.hvac_bill_links.forEach((link: HvacBillLink) => {
      if (!link.txn_id) return;
      if (!billLinksByTxnId.has(link.txn_id)) billLinksByTxnId.set(link.txn_id, []);
      billLinksByTxnId.get(link.txn_id)!.push(link);
    });
    // Montar estrutura relacional
    return data.hvac_estimates.map((est: HvacEstimate) => {
      // Linhas do estimate
      const lines = data.hvac_estimate_lines.filter(l => l.estimate_id === est.id);
      // Bills: buscar bill_lines com mesmo customer_id OU customer_name, sendo mais flexível
      let billLines = data.hvac_bill_lines.filter(line => {
        // Primeiro, verificar se a bill line está dentro do período de data
        const bill = billsById.get(line.bill_id);
        if (bill && bill.txn_date) {
          const billDate = new Date(bill.txn_date);
          const fromDate = new Date(dateFrom);
          const toDate = new Date(dateTo);
          if (billDate < fromDate || billDate > toDate) {
            return false; // Bill line fora do período
          }
        }

        // Se ambos os campos estão preenchidos, usar a lógica original
        if (est.customer_id && est.customer_name && line.customer_id && line.customer_name) {
          return line.customer_id === est.customer_id && line.customer_name === est.customer_name;
        }
        // Se apenas customer_id está preenchido
        if (est.customer_id && line.customer_id) {
          return line.customer_id === est.customer_id;
        }
        // Se apenas customer_name está preenchido
        if (est.customer_name && line.customer_name) {
          return line.customer_name === est.customer_name;
        }
        // Se nenhum está preenchido, não incluir
        return false;
      });



      // Adicionar bill lines encontradas através dos bill_links (conexão direta com estimate)
      const billLinksForEstimate = billLinksByTxnId.get(est.external_id) || [];
      const billIdsFromLinks = new Set(billLinksForEstimate.map(link => link.bill_id));
      
      const additionalBillLines = data.hvac_bill_lines.filter(line => {
        // Verificar se está dentro do período de data
        const bill = billsById.get(line.bill_id);
        if (bill && bill.txn_date) {
          const billDate = new Date(bill.txn_date);
          const fromDate = new Date(dateFrom);
          const toDate = new Date(dateTo);
          if (billDate < fromDate || billDate > toDate) {
            return false; // Bill line fora do período
          }
        }
        return billIdsFromLinks.has(line.bill_id);
      });



      // Terceira estratégia: buscar bill lines que podem estar relacionadas por account_ref_name
      // (algumas bill lines podem ter o nome do projeto no account_ref_name)
      const projectNameFromEstimate = getProjectName(est.customer_name);
      const additionalBillLinesByAccount = data.hvac_bill_lines.filter(line => {
        // Verificar se está dentro do período de data
        const bill = billsById.get(line.bill_id);
        if (bill && bill.txn_date) {
          const billDate = new Date(bill.txn_date);
          const fromDate = new Date(dateFrom);
          const toDate = new Date(dateTo);
          if (billDate < fromDate || billDate > toDate) {
            return false; // Bill line fora do período
          }
        }
        
        if (!line.account_ref_name || !projectNameFromEstimate) return false;
        return line.account_ref_name.toLowerCase().includes(projectNameFromEstimate.toLowerCase()) ||
               projectNameFromEstimate.toLowerCase().includes(line.account_ref_name.toLowerCase());
      });

      // Quarta estratégia: buscar bill lines de projetos similares (mesmo customer_id mas customer_name diferente)
      const additionalBillLinesBySimilarCustomer = data.hvac_bill_lines.filter(line => {
        // Verificar se está dentro do período de data
        const bill = billsById.get(line.bill_id);
        if (bill && bill.txn_date) {
          const billDate = new Date(bill.txn_date);
          const fromDate = new Date(dateFrom);
          const toDate = new Date(dateTo);
          if (billDate < fromDate || billDate > toDate) {
            return false; // Bill line fora do período
          }
        }
        
        if (!est.customer_id || !line.customer_id) return false;
        return line.customer_id === est.customer_id && line.customer_name !== est.customer_name;
      });

      // Combinar todas as estratégias e remover duplicatas
      const allBillLines = [...billLines, ...additionalBillLines, ...additionalBillLinesByAccount, ...additionalBillLinesBySimilarCustomer];
      const uniqueBillLines = allBillLines.filter((line, index, self) => 
        index === self.findIndex(l => l.id === line.id)
      );
      
      billLines = uniqueBillLines;


            
      // Agrupar bill lines por bill_id para mostrar todas as linhas de cada bill
      const billLinesByBillId = new Map<string, typeof billLines>();
      billLines.forEach(line => {
        if (!billLinesByBillId.has(line.bill_id)) {
          billLinesByBillId.set(line.bill_id, []);
        }
        billLinesByBillId.get(line.bill_id)!.push(line);
      });



      // Para cada bill, pegar todas as suas bill_lines
      const bills = Array.from(billLinesByBillId.entries()).map(([billId, lines]) => {
        const bill = billsById.get(billId);
        if (!bill) return null; // Se não encontrar a bill, pular


        
        // Buscar bill payments para esta bill através dos bill_payment_links
        const billPaymentLinks = billPaymentLinksByTxnId.get(bill.external_id) || [];
        const billPayments = billPaymentLinks.map(link => {
          const billPayment = billPaymentsById.get(link.bill_payment_id);
          return billPayment ? {
            id: billPayment.id,
            doc_number: billPayment.doc_number,
            total_amount: billPayment.total_amount,
            txn_date: billPayment.txn_date,
            private_note: billPayment.private_note
          } : null;
        }).filter((bp): bp is NonNullable<typeof bp> => bp !== null);
        
        return {
          bill: {
            id: bill.id,
            doc_number: bill.doc_number || '',
            external_id: bill.external_id,
            total_amount: bill.total_amount || 0,
            txn_date: bill.txn_date
          },
          lines: lines.map(line => ({
            id: line.id,
            estimate_id: undefined,
            description: line.description,
            amount: line.amount,
            account_ref_name: line.account_ref_name
          })),
          bill_payments: billPayments
        };
      }).filter((b): b is NonNullable<typeof b> => b !== null);


      // Invoices: buscar invoices com mesmo customer_id/nome
      const invoices = (invoicesByCustomer.get(est.customer_id + '|' + est.customer_name) || []).map(inv => {
        // Payments: buscar payment_links onde txn_id = inv.external_id e txn_type = 'Invoice'
        const paymentLinks = paymentLinksByTxnIdType.get(inv.external_id + '|Invoice') || [];
        const payments = paymentLinks.map(pl => pl.payment_id ? paymentsById.get(pl.payment_id) : undefined).filter((p): p is HvacPayment => !!p);
        return { ...inv, payments };
      });
      // Payments dos invoices deste estimate
      const payments: HvacPayment[] = [];
      invoices.forEach((inv) => {
        if (Array.isArray(inv.payments)) {
          inv.payments.forEach((p: HvacPayment) => {
            if (!payments.find(x => x.id === p.id)) payments.push(p);
          });
        }
      });
      return {
        estimate: {
          id: est.id,
          doc_number: est.doc_number,
          txn_date: est.txn_date,
          txn_status: est.txn_status,
          customer_id: est.customer_id,
          customer_name: est.customer_name,
          total_amount: est.total_amount,
          external_id: est.external_id
        },
        lines: lines.map(l => ({
          id: l.id,
          estimate_id: l.estimate_id,
          description: l.description,
          amount: l.amount
        })),
        links: [], // não usado
        bills,
        payments,
        invoices
      };
    });
  }, [data, dateFrom, dateTo]);

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
    let filtered = estimatesRel;

    // Filtro Just Accepted
    if (onlyAccepted) {
      filtered = filtered.filter(rel => rel.estimate.txn_status === 'Accepted');
    }
    // Filtro de data sobre o estimate (txn_date)
    filtered = filtered.filter(rel => {
      const date = rel.estimate.txn_date;
      if (!date) return false;
      const d = new Date(date);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      return d >= from && d <= to;
    });

    // Filtro por texto
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(rel => {
        const projectName = getProjectName(rel.estimate.customer_name).toLowerCase();
        const customerName = (rel.estimate.customer_name || '').toLowerCase();
        const docNumber = (rel.estimate.doc_number || '').toLowerCase();
        return projectName.includes(term) || customerName.includes(term) || docNumber.includes(term);
      });
    }
    
    // Ordenação
    if (sortBy === 'date') {
      filtered = [...filtered].sort((a, b) => {
        const dateA = new Date(a.estimate.txn_date || '').getTime();
        const dateB = new Date(b.estimate.txn_date || '').getTime();
        return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
      });
    } else if (sortBy === 'total') {
      filtered = [...filtered].sort((a, b) => {
        const totalA = a.estimate.total_amount || 0;
        const totalB = b.estimate.total_amount || 0;
        return sortDirection === 'desc' ? totalB - totalA : totalA - totalB;
      });
    } else if (sortBy === 'name') {
      filtered = [...filtered].sort((a, b) => {
        const nameA = getProjectName(a.estimate.customer_name).toLowerCase();
        const nameB = getProjectName(b.estimate.customer_name).toLowerCase();
        return sortDirection === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      });
    }
    return filtered;
  }, [estimatesRel, onlyAccepted, dateFrom, dateTo, sortBy, sortDirection, searchTerm]);

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
    setSearchTerm('');
  };

  // Modal
  function handleOpenModal(idx: number) {
    setModalIdx(idx);
  }
  function handleCloseModal() {
    setModalIdx(null);
  }

  // Estado para hover de Bill/Invoice
  const [itemsOpen, setItemsOpen] = useState(false);
  // Estado para hover e seleção de Invoice
  const [hoveredInvoiceIdx, setHoveredInvoiceIdx] = useState<number | null>(null);
  const [selectedInvoiceIdx, setSelectedInvoiceIdx] = useState<number | null>(null);
  // Estado para expansão dos grupos de bill lines por account_ref_name
  const [expandedBillGroups, setExpandedBillGroups] = useState<Set<string>>(new Set());
  // Estado para hover das linhas individuais dentro dos grupos expandidos
  const [hoveredBillLineIdx, setHoveredBillLineIdx] = useState<string | null>(null);
  // Estado para tooltip de bill payments
  const [billPaymentTooltip, setBillPaymentTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    payments: Array<{ id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null; private_note?: string | null }>;
    accountName: string;
  }>({
    show: false,
    x: 0,
    y: 0,
    payments: [],
    accountName: ''
  });
  // Remover refs não usadas

  // Handler para filtro de datas
  const handleDateChange = (type: 'from' | 'to', value: string) => {
    if (type === 'from') setDateFrom(value);
    if (type === 'to') setDateTo(value);
  };

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
    // const allPayments = rel.payments; // não utilizado
    // Agrupar Invoices
    // const allInvoices = rel.links.filter(l => l.txn_type === 'Invoice');
    // NOVO: usar rel.invoices se existir, ou ajustar para buscar o array completo
    const allInvoices = ((rel as { invoices?: InvoiceType[] }).invoices || []).map(inv => ({ ...inv } as InvoiceType));
    // Agrupar todos os payments únicos de todos os invoices
    const allInvoicePayments: PaymentType[] = [];
    allInvoices.forEach(inv => {
      if (Array.isArray(inv.payments)) {
        inv.payments.forEach(p => {
          if (!allInvoicePayments.find(x => x.id === p.id)) allInvoicePayments.push(p);
        });
      }
    });
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
          onClick={() => {
            handleCloseModal();
            setBillPaymentTooltip(prev => ({ ...prev, show: false }));
          }}
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
              {getProjectName(rel.estimate.customer_name) || '-'}
            </h5>
            <CloseButton onClick={handleCloseModal} size="md" style={{ transition: 'background 0.2s, box-shadow 0.2s', borderRadius: 6, border: 'none', cursor: 'pointer' }} />
          </div>
          {/* Corpo principal */}
          <div style={{ padding: 24, background: 'var(--color-background-primary)', flex: 1, overflowY: 'auto', minHeight: 0, maxHeight: 'calc(90vh - 120px)', position: 'relative' }} className="custom-scrollbar">
            {/* Bloco Estimate Moderno */}
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: 12, padding: '18px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span><i className="bi bi-calendar-event" style={{ marginRight: 4 }} />{formatDateUS(rel.estimate.txn_date)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 15 }}>ID {rel.estimate.customer_id || '-'}</span>
                  <span style={{ color: 'var(--color-accent-primary)', fontWeight: 700, fontSize: 18 }}>{formatCurrency(rel.estimate.total_amount)}</span>
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
                    height: 34,
                    minWidth: 34,
                    minHeight: 34,
                    fontWeight: 500,
                    fontSize: 15,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'background 0.2s, color 0.2s, border 0.2s',
                    marginBottom: 10,
                    padding: '0 12px',
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
                    maxHeight: itemsOpen ? 500 : 0,
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
                  {itemsOpen && rel.lines && rel.lines.length > 0 ? (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 400 }}>
                      {rel.lines.map((line, idx) => (
                        <li key={line.id || idx} style={{ width: '100%', boxSizing: 'border-box', padding: '0 18px', height: 38, display: 'flex', alignItems: 'center', borderBottom: idx < rel.lines.length - 1 ? '1px solid var(--color-border-divider)' : 'none', background: 'transparent' }}>
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, flex: 3, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.description || '-'}</span>
                          <span style={{ color: 'var(--color-accent-primary)', fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{formatCurrency(line.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : itemsOpen ? <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: 8 }}>Nenhum item cadastrado para este estimate.</div> : null}
                </div>
              </div>
            </div>
            {/* NOVO PADRÃO: Bills e Invoices lado a lado, cada um com seu bloco de pagamentos abaixo, conectados por linha vertical */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: 32, justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              {/* Coluna Bills (a pagar) */}
              <div style={{ flex: 1.3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                {/* Bloco Bills (superior) */}
                <div style={{ background: COLORS.billpayment + '11', border: `1px solid ${COLORS.billStrong}`, borderRadius: 10, padding: '10px 18px 0 18px', minWidth: 420 }}>
                                     <div style={{ color: COLORS.billStrong, fontWeight: 700, fontSize: 16, paddingBottom: 10, marginBottom: 10, marginLeft: -18, marginRight: -18, paddingLeft: 18, paddingRight: 18, borderBottom: `1px solid ${COLORS.billStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`bi ${ICONS.bill}`} style={{ fontSize: 18 }} /> Bills
                    </div>
                    <span style={{ color: COLORS.billStrong, fontWeight: 600, fontSize: 14 }}>
                      {(() => {
                        const totalBills = allBills.reduce((total, b) => {
                          return total + b.lines.reduce((lineTotal, line) => lineTotal + (line.amount || 0), 0);
                        }, 0);
                        return totalBills.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                      })()}
                    </span>
                  </div>
                  {/* Header das colunas */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px 6px 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} title="Data"><i className="bi bi-calendar-event" /></span>
                    <span style={{ flex: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} title="Descrição"><i className="bi bi-file-earmark-text" /></span>
                    <span style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} title="Valor"><i className="bi bi-currency-dollar" /></span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', marginBottom: 12 }}>
                    {(() => {
                      // Agrupar todas as bill lines por account_ref_name
                      const groupedBillLines = new Map<string, {
                        accountRefName: string;
                        totalAmount: number;
                                                 lines: Array<{
                           id: string;
                           bill: { id: string; txn_date?: string | null; external_id?: string | null };
                           line: { id: string; account_ref_name?: string | null; amount: number | null; description?: string | null };
                           bill_payments: Array<{ id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null; private_note?: string | null }>;
                         }>;
                      }>();

                      // Processar todas as bills e suas linhas
                      allBills.forEach((b) => {
                        b.lines.forEach((line) => {
                          const accountRefName = line.account_ref_name || 'Sem categoria';
                          if (!groupedBillLines.has(accountRefName)) {
                            groupedBillLines.set(accountRefName, {
                              accountRefName,
                              totalAmount: 0,
                              lines: []
                            });
                          }
                          
                          const group = groupedBillLines.get(accountRefName)!;
                          group.totalAmount += line.amount || 0;
                          group.lines.push({
                            id: line.id,
                            bill: b.bill,
                            line,
                            bill_payments: b.bill_payments
                          });
                        });
                      });

                      // Renderizar grupos
                      return Array.from(groupedBillLines.values()).map((group, groupIdx) => {
                        const groupKey = `group-${groupIdx}`;
                        const isExpanded = expandedBillGroups.has(groupKey);
                        
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
                              <span style={{ flex: 1 }}>-</span>
                              <span style={{ flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                {group.accountRefName}
                              </span>
                              <span style={{ flex: 1.5, color: COLORS.billStrong, textAlign: 'left', fontWeight: 600 }}>
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
                                  const newExpanded = new Set(expandedBillGroups);
                                  if (isExpanded) {
                                    newExpanded.delete(groupKey);
                                  } else {
                                    newExpanded.add(groupKey);
                                  }
                                  setExpandedBillGroups(newExpanded);
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
                                  {group.lines.map((item, lineIdx) => (
                                    <li
                                      key={item.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: 12,
                                        padding: '0 0 0 16px',
                                        height: 28,
                                        borderBottom: lineIdx < group.lines.length - 1 ? '1px solid var(--color-border-divider)' : 'none',
                                        width: '100%',
                                        position: 'relative',
                                        background: hoveredBillLineIdx === item.id ? 'rgba(242,139,130,0.12)' : 'transparent',
                                        borderRadius: 0,
                                        transition: 'background 0.2s',
                                      }}
                                      onMouseEnter={() => setHoveredBillLineIdx(item.id)}
                                      onMouseLeave={() => setHoveredBillLineIdx(null)}
                                    >
                                      <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                                        {formatDateUS(item.bill.txn_date) || ''}
                                      </span>
                                      <span style={{ flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                                        {item.line.description || item.line.account_ref_name || ''}
                                      </span>
                                      <span style={{ flex: 1.5, color: COLORS.billStrong, textAlign: 'left', fontSize: 11 }}>
                                        {(item.line.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                      </span>
                                      {/* Botão de olho para ver bill payments */}
                                      {hoveredBillLineIdx === item.id && item.bill_payments.length > 0 && (
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
                                               payments: item.bill_payments,
                                               accountName: item.line.account_ref_name || 'Sem categoria'
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
                      });
                    })()}
                  </ul>
                </div>
                {/* Pagamentos de Bills (inferior) */}
                {/* Removido completamente o bloco de Bill Payments */}
              </div>
              {/* Coluna Invoices (a receber) */}
              <div style={{ flex: 1.3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                {/* Bloco Invoices (superior) */}
                <div style={{ background: COLORS.payment + '11', border: `1px solid ${COLORS.invoiceStrong}`, borderRadius: 10, padding: '10px 18px 0 18px', minWidth: 420 }}>
                                     <div style={{ color: COLORS.invoiceStrong, fontWeight: 700, fontSize: 16, paddingBottom: 10, marginBottom: 10, marginLeft: -18, marginRight: -18, paddingLeft: 18, paddingRight: 18, borderBottom: `1px solid ${COLORS.invoiceStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className={`bi ${ICONS.invoice}`} style={{ fontSize: 18, color: COLORS.invoiceStrong, marginRight: 8, verticalAlign: 'middle' }} /> Invoices
                    </div>
                    <span style={{ color: COLORS.invoiceStrong, fontWeight: 600, fontSize: 14 }}>
                      {(() => {
                        const totalInvoices = allInvoices.reduce((total, inv) => {
                          return total + (inv.total_amount || 0);
                        }, 0);
                        return totalInvoices.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                      })()}
                    </span>
                  </div>
                  {/* Header das colunas */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px 6px 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} title="Data"><i className="bi bi-calendar-event" /></span>
                    <span style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} title="Número"><i className="bi bi-file-earmark-text" /></span>
                    <span style={{ flex: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }} title="Total"><i className="bi bi-currency-dollar" /></span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', marginBottom: 12 }}>
                    {allInvoices.map((inv, idx) => (
                      <React.Fragment key={inv.id || idx}>
                        <li
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: 13,
                            padding: '0 8px',
                            height: 32,
                            borderBottom: idx < allInvoices.length - 1 ? '1px solid var(--color-border-divider)' : 'none',
                            width: '100%',
                            position: 'relative',
                            background: hoveredInvoiceIdx === idx ? 'rgba(167,233,175,0.10)' : selectedInvoiceIdx === idx ? 'rgba(167,233,175,0.18)' : 'transparent',
                            borderRadius: 0,
                            transition: 'background 0.2s, margin-bottom 0.2s',
                          }}
                          onMouseEnter={() => setHoveredInvoiceIdx(idx)}
                          onMouseLeave={() => setHoveredInvoiceIdx(null)}
                        >
                          <span style={{ flex: 1 }}>{formatDateUS(inv.txn_date) || ''}</span>
                          <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.doc_number || ''}</span>
                          <span style={{ flex: 1.5, color: COLORS.invoiceStrong, textAlign: 'left' }}>{inv.total_amount ? inv.total_amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}</span>
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
                              margin: '8px 0', // espaçamento abaixo do bloco de pagamentos
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
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0 6px 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                              <span style={{ flex: 1.5 }}>Data</span>
                              <span style={{ flex: 2 }}>Nota</span>
                              <span style={{ flex: 2 }}>Ref</span>
                              <span style={{ flex: 1.5 }}>Valor</span>
                            </div>
                            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                              {(Array.isArray(inv.payments) ? inv.payments : []).map((p, i) => (
                                <li key={p.id || i} style={{ display: 'flex', alignItems: 'center', fontSize: 13, padding: '0 0 0 0', height: 32, borderBottom: i < (inv.payments ? inv.payments.length - 1 : 0) ? '1px solid var(--color-border-divider)' : 'none', width: '100%' }}>
                                  <span style={{ flex: 1.5, color: 'var(--color-text-secondary)', textAlign: 'left' }}>{formatDateUS(p.txn_date)}</span>
                                  <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.private_note || ''}>{p.private_note || '-'}</span>
                                  <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.payment_ref || ''}>{p.payment_ref || '-'}</span>
                                  <span style={{ flex: 1.5, color: COLORS.invoiceStrong, textAlign: 'left' }}>{p.total_amount ? p.total_amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : ''}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        )}
                      </React.Fragment>
                    ))}
                  </ul>
                </div>
                {/* Pagamentos Recebidos (inferior) */}
                {/* Removido completamente o bloco de Payments Recebidos */}
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
        
        {/* Tooltip personalizada para Bill Payments */}
        {billPaymentTooltip.show && (
          <div
            style={{
              position: 'fixed',
              top: billPaymentTooltip.y,
              left: billPaymentTooltip.x - 200,
              width: 400,
              background: 'var(--color-background-secondary)',
              border: `1px solid ${COLORS.billStrong}`,
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              zIndex: 2147483648,
              padding: '16px',
              color: 'var(--color-text-primary)',
              fontSize: 13,
              maxHeight: 300,
              overflowY: 'auto',
              animation: 'fadeSlideIn 0.3s cubic-bezier(0.4, 0.2, 0.2, 1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header da tooltip */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--color-border-divider)'
            }}>
              <div style={{ 
                color: COLORS.billStrong, 
                fontWeight: 600, 
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <i className="bi bi-cash-stack" style={{ fontSize: 16 }} />
                Bill Payments - {billPaymentTooltip.accountName}
              </div>
              <button
                onClick={() => setBillPaymentTooltip(prev => ({ ...prev, show: false }))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: 0,
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <i className="bi bi-x" />
              </button>
            </div>
            
            {/* Conteúdo da tooltip */}
            {billPaymentTooltip.payments.length > 0 ? (
              <div>
                {/* Header das colunas */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '0 0 8px 0', 
                  fontSize: 12, 
                  color: 'var(--color-text-secondary)',
                  fontWeight: 500
                }}>
                  <span style={{ flex: 1.5 }}>Data</span>
                  <span style={{ flex: 2 }}>Número</span>
                  <span style={{ flex: 2 }}>Nota</span>
                  <span style={{ flex: 1.5 }}>Valor</span>
                </div>
                
                {/* Lista de pagamentos */}
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {billPaymentTooltip.payments.map((bp, i) => (
                    <li 
                      key={bp.id || i} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        fontSize: 12, 
                        padding: '6px 0', 
                        borderBottom: i < billPaymentTooltip.payments.length - 1 ? '1px solid var(--color-border-divider)' : 'none', 
                        width: '100%' 
                      }}
                    >
                      <span style={{ flex: 1.5, color: 'var(--color-text-secondary)' }}>
                        {formatDateUS(bp.txn_date)}
                      </span>
                      <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bp.doc_number || '-'}
                      </span>
                      <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bp.private_note || '-'}
                      </span>
                      <span style={{ flex: 1.5, color: COLORS.billStrong, fontWeight: 600 }}>
                        {(bp.total_amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={{ 
                color: 'var(--color-text-secondary)', 
                fontStyle: 'italic', 
                textAlign: 'center',
                padding: '20px 0'
              }}>
                Nenhum pagamento encontrado para esta linha.
              </div>
            )}
          </div>
        )}
      </div>,
      document.body
    );
  };

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
              <button
                onClick={() => {
                  setOnlyAccepted(onlyAccepted);
                  setDateFrom(dateFrom);
                  setDateTo(dateTo);
                  reload();
                }}
                style={{
                  marginLeft: 10,
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-accent-primary)',
                  border: '1.5px solid var(--color-accent-primary)',
                  borderRadius: 15,
                  padding: '4px 18px',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  height: 26,
                  minWidth: 90,
                  boxShadow: 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--color-accent-primary)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--color-background-primary)';
                  e.currentTarget.style.color = 'var(--color-accent-primary)';
                }}
              >
                Filtrar
              </button>
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
          {filteredEstimates.map((rel, idx) => {
            // Dados agregados
            const projectName = getProjectName(rel.estimate.customer_name);
            const status = rel.estimate.txn_status || 'Accepted';
            const relWithInv = rel as AcceptedEstimateRelWithInvoices;
            const invoices: InvoiceType[] = Array.isArray(relWithInv.invoices) ? relWithInv.invoices : [];
            const invoiceCount = invoices.length;
            
            // Bills (garantir tipo correto)
            const bills = (Array.isArray(rel.bills) && rel.bills.length > 0 ? rel.bills : []) as {
              bill: { id: string; doc_number?: string | null; external_id?: string | null; total_amount?: number | null; txn_date?: string | null };
              lines: { id: string; estimate_id?: string; description: string | null; amount: number | null; quantity?: number | null; item_ref_name?: string | null; customer_id?: string | null; customer_name?: string | null; bill_id?: string }[];
              bill_payments: { id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null }[];
            }[];
            const billCount = bills.length;
            
            // Pagamentos únicos recebidos (por invoice)
            const uniquePaymentsReceived = new Set();
            invoices.forEach(inv => {
              if (Array.isArray(inv.payments)) {
                inv.payments.forEach(payment => {
                  uniquePaymentsReceived.add(payment.id);
                });
              }
            });
            const paymentsReceivedCount = uniquePaymentsReceived.size;
            
            // Pagamentos únicos feitos (por bill)
            const uniquePaymentsMade = new Set();
            bills.forEach(bill => {
              if (Array.isArray(bill.bill_payments)) {
                bill.bill_payments.forEach(payment => {
                  uniquePaymentsMade.add(payment.id);
                });
              }
            });
            const paymentsMadeCount = uniquePaymentsMade.size;
            
            return (
              <div key={rel.estimate.id} style={{ minWidth: 230, maxWidth: 320, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-divider)', borderRadius: 8, boxShadow: hovered === rel.estimate.id ? '0 8px 24px rgba(0,0,0,0.15)' : '0 2px 12px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', height: '320px', overflow: 'hidden', boxSizing: 'border-box', marginTop: 0, marginBottom: 0, transform: hovered === rel.estimate.id ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)' }} onMouseEnter={() => setHovered(rel.estimate.id)} onMouseLeave={() => setHovered(null)} onClick={() => handleOpenModal(idx)} title={hovered === rel.estimate.id ? projectName : ''}>
                {/* Cabeçalho */}
                <div className="px-3" style={{ borderBottom: '1px solid var(--color-border-divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48, background: 'var(--color-background-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: STATUS[status as keyof typeof STATUS]?.color || 'var(--color-text-secondary)' }}>
                      <i className={STATUS[status as keyof typeof STATUS]?.icon || 'bi-circle'} />
                    </span>
                    <span style={{ color: STATUS[status as keyof typeof STATUS]?.color || 'var(--color-text-secondary)', fontWeight: 700, fontSize: 12, letterSpacing: 0.2 }}>{status}</span>
                  </div>
                  <span style={{ color: 'var(--color-accent-primary)', fontSize: 14, fontWeight: 500, letterSpacing: 0.1 }}>{rel.estimate.customer_id || '-'}</span>
                </div>
                
                {/* Corpo */}
                <div style={{ padding: '16px 20px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1, height: '100%', boxSizing: 'border-box' }}>

                  {/* Data do projeto */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                      {rel.estimate.txn_date ? (() => {
                        const d = new Date(rel.estimate.txn_date);
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
          })}
        </div>
      </div>
      {/* Modal Detalhado */}
      {modalIdx !== null && filteredEstimates[modalIdx] && renderModal(filteredEstimates[modalIdx], itemsOpen, setItemsOpen)}
    </div>
  );
} 