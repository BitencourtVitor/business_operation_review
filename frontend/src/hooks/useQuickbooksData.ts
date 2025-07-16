import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Função utilitária para dividir arrays em lotes
function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

// Tipos principais
interface EstimateType {
  id: string;
  doc_number: string | null;
  txn_date: string | null;
  txn_status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  external_id: string | null;
}
interface LineType {
  id: string;
  estimate_id: string;
  description: string | null;
  amount: number | null;
  quantity?: number | null;
  item_ref_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  bill_id?: string;
}
interface LinkType {
  id: string;
  estimate_id: string;
  txn_id: string;
  txn_type: string | null;
}
interface PaymentType {
  id: string;
  total_amount: number | null;
  txn_date: string | null;
  payment_ref: string | null;
  private_note: string | null;
}
interface BillType {
  bill: {
    id: string;
    doc_number?: string | null;
    external_id?: string | null;
    total_amount?: number | null;
    txn_date?: string | null;
  };
  lines: LineType[];
  bill_payments: BillPaymentType[];
}
interface BillPaymentType {
  id: string;
  doc_number?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
}
interface EstimateRelational {
  estimate: EstimateType;
  lines: LineType[];
  links: LinkType[];
  bills: BillType[];
  payments: PaymentType[];
}

interface InvoiceType {
  id: string;
  external_id: string;
  doc_number?: string | null;
  txn_date?: string | null;
  due_date?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  total_amount?: number | null;
  balance?: number | null;
  last_updated_at?: string | null;
  created_at?: string | null;
  // outros campos se necessário
}

const useQuickbooksData = (statusFilter: string[] = ['Accepted'], dateFrom?: string, dateTo?: string) => {
  const [estimatesRel, setEstimatesRel] = useState<EstimateRelational[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEstimatesRel = async (filters?: { statusFilter?: string[], dateFrom?: string, dateTo?: string }) => {
    const activeFilters = filters || { statusFilter, dateFrom, dateTo };
    
    setLoading(true);
    setError(null);
    try {
      // Buscar estimates com filtro dinâmico de status
      let estQuery = supabase
        .from('hvac_estimates')
        .select('*');
      if (activeFilters.statusFilter && activeFilters.statusFilter.length > 0) {
        estQuery = estQuery.in('txn_status', activeFilters.statusFilter);
      }
      if (activeFilters.dateFrom) {
        estQuery = estQuery.gte('txn_date', activeFilters.dateFrom);
      }
      if (activeFilters.dateTo) {
        estQuery = estQuery.lte('txn_date', activeFilters.dateTo);
      }
      const { data: estimates, error: errEst } = await estQuery;
      if (errEst) throw new Error(errEst.message);
      if (!estimates) return setEstimatesRel([]);
      const estimateIds = estimates.map((e: EstimateType) => e.id);
      // Linhas e links
      const { data: lines, error: errLines } = await supabase
        .from('hvac_estimate_lines')
        .select('*')
        .in('estimate_id', estimateIds);
      if (errLines) throw new Error(errLines.message);
      const { data: links, error: errLinks } = await supabase
        .from('hvac_estimate_links')
        .select('*')
        .in('estimate_id', estimateIds);
      if (errLinks) throw new Error(errLinks.message);
      // Links de estimate para invoice
      const { data: estLinks } = await supabase
        .from('hvac_estimate_links')
        .select('*')
        .in('estimate_id', estimateIds)
        .eq('txn_type', 'Invoice');
      const invoiceIds = estLinks ? estLinks.map((l: LinkType) => l.txn_id) : [];
      // Links de invoice para payment
      let payLinks: { payment_id: string; txn_id: string; txn_type: string | null }[] = [];
      if (invoiceIds.length > 0) {
        const { data: pls } = await supabase
          .from('hvac_payment_links')
          .select('*')
          .in('txn_id', invoiceIds)
          .eq('txn_type', 'Invoice');
        payLinks = pls || [];
      }
      // Payments
      const paymentIds = payLinks.map((l) => l.payment_id);
      let payments: PaymentType[] = [];
      if (paymentIds.length > 0) {
        const { data: pays } = await supabase
          .from('hvac_payments')
          .select('id, total_amount, txn_date, payment_ref, private_note')
          .in('id', paymentIds);
        payments = pays || [];
      }
      // Bills (por customer_id + customer_name)
      const customerIds = Array.from(new Set(estimates.map((e: EstimateType) => e.customer_id).filter(Boolean)));
      const customerNames = Array.from(new Set(estimates.map((e: EstimateType) => e.customer_name).filter(Boolean)));
      let billLines: LineType[] = [];
      if (customerIds.length > 0 && customerNames.length > 0) {
        try {
          const { data: billLinesData, error: billLinesErr } = await supabase
            .from('hvac_bill_lines')
            .select('*')
            .in('customer_id', customerIds)
            .in('customer_name', customerNames);
          if (billLinesErr) {
            console.warn('Erro ao buscar bill lines:', billLinesErr.message);
          } else {
            billLines = billLinesData || [];
          }
        } catch (err) {
          console.warn('Erro ao processar bill lines:', err);
        }
      }
      const billIds = Array.from(new Set(billLines.map((l) => l.bill_id)));
      type BillMain = {
        id: string;
        doc_number?: string | null;
        external_id?: string | null;
        total_amount?: number | null;
        txn_date?: string | null;
      };
      let bills: BillMain[] = [];
      if (billIds.length > 0) {
        const batches = chunkArray(billIds, 50);
        let billsData: BillMain[] = [];
        for (const batch of batches) {
          const { data: billsBatch, error: billsErr } = await supabase
            .from('hvac_bills')
            .select('*')
            .in('id', batch);
          if (billsErr) throw new Error(billsErr.message);
          if (billsBatch) billsData = billsData.concat(billsBatch);
        }
        bills = billsData;
      }
      // Bill Payment links
      const billExternalIds = bills.map((b) => b.external_id).filter(Boolean) as string[];
      type BillPaymentLink = { bill_payment_id: string; txn_id: string; txn_type: string | null };
      let billPaymentLinks: BillPaymentLink[] = [];
      if (billExternalIds.length > 0) {
        const batches = chunkArray(billExternalIds, 50);
        let linksData: BillPaymentLink[] = [];
        for (const batch of batches) {
          const { data: bpl, error: bplErr } = await supabase
            .from('hvac_bill_payment_links')
            .select('*')
            .in('txn_id', batch)
            .in('txn_type', ['Bill', 'VendorCredit']);
          if (bplErr) throw new Error(bplErr.message);
          if (bpl) linksData = linksData.concat(bpl);
        }
        billPaymentLinks = linksData;
      }
      // Bill Payments
      const billPaymentIds = Array.from(new Set(billPaymentLinks.map((l) => l.bill_payment_id)));
      let billPayments: BillPaymentType[] = [];
      if (billPaymentIds.length > 0) {
        const batches = chunkArray(billPaymentIds, 50);
        let paymentsData: BillPaymentType[] = [];
        for (const batch of batches) {
          const { data: bps, error: bpsErr } = await supabase
            .from('hvac_bill_payments')
            .select('id, doc_number, total_amount, txn_date')
            .in('id', batch);
          if (bpsErr) throw new Error(bpsErr.message);
          if (bps) paymentsData = paymentsData.concat(bps);
        }
        billPayments = paymentsData;
      }
      // Mapear Bill Payments por bill_external_id
      const billPaymentsByExternalId = new Map<string, BillPaymentType[]>();
      for (const link of billPaymentLinks) {
        if (!billPaymentsByExternalId.has(link.txn_id)) billPaymentsByExternalId.set(link.txn_id, []);
        const bp = billPayments.find((b) => b.id === link.bill_payment_id);
        if (bp && !billPaymentsByExternalId.get(link.txn_id)!.some((b) => b.id === bp.id)) {
          billPaymentsByExternalId.get(link.txn_id)!.push(bp);
        }
      }
      // Mapear linhas por bill_id
      const billLinesByBillId = new Map<string, LineType[]>();
      for (const line of billLines) {
        if (!billLinesByBillId.has(line.bill_id!)) billLinesByBillId.set(line.bill_id!, []);
        billLinesByBillId.get(line.bill_id!)!.push(line);
      }
      // Montar estrutura: cada Bill com suas linhas e seus Bill Payments únicos
      const billsRel: BillType[] = bills.map((bill) => {
        const lines = billLinesByBillId.get(bill.id) || [];
        const bill_payments = billPaymentsByExternalId.get(bill.external_id || '') || [];
        return { bill, lines, bill_payments };
      });
      // Buscar todos os invoices completos do banco usando os external_id dos links
      let invoices: InvoiceType[] = [];
      if (invoiceIds.length > 0) {
        const batches = chunkArray(invoiceIds, 25); // Reduzido para 25 para evitar erro de URL muito longa
        let invoicesData: InvoiceType[] = [];
        for (const batch of batches) {
          try {
            const { data: invs, error: invsErr } = await supabase
              .from('hvac_invoices')
              .select('*')
              .in('external_id', batch);
            if (invsErr) {
              console.warn('Erro ao buscar invoices:', invsErr.message);
              continue; // Continua com o próximo batch em vez de falhar completamente
            }
            if (invs) invoicesData = invoicesData.concat(invs as InvoiceType[]);
          } catch (err) {
            console.warn('Erro ao processar batch de invoices:', err);
            continue;
          }
        }
        invoices = invoicesData;
      }
      // Payments dos invoices (por external_id)
      // Mapear payments por invoice.external_id
      const paymentsByInvoiceExternalId = new Map<string, PaymentType[]>();
      if (invoices.length > 0 && payLinks.length > 0 && payments.length > 0) {
        for (const inv of invoices) {
          const linksForInvoice = payLinks.filter(l => l.txn_id === inv.external_id && l.txn_type === 'Invoice');
          const paymentIds = linksForInvoice.map(l => l.payment_id);
          const relatedPayments = payments.filter(p => paymentIds.includes(p.id));
          paymentsByInvoiceExternalId.set(inv.external_id, relatedPayments);
        }
      }
      // Montar estrutura relacional
      const rel: EstimateRelational[] = estimates.map((est: EstimateType) => {
        // Invoices deste estimate (usando os links)
        const estInvoiceLinks = links ? links.filter((l) => l.estimate_id === est.id && l.txn_type === 'Invoice') : [];
        const estInvoiceIds = estInvoiceLinks.map((l) => l.txn_id);
        const estInvoices = invoices.filter((inv) => estInvoiceIds.includes(inv.external_id)).map(inv => ({
          ...inv,
          payments: paymentsByInvoiceExternalId.get(inv.external_id) || []
        }));
        // Bills deste estimate
        let estBills: BillType[] = [];
        if (est.customer_id && est.customer_name) {
          estBills = billsRel.filter((brel) =>
            brel.lines.some((l) => l.customer_id === est.customer_id && l.customer_name === est.customer_name)
          );
        }
        // Payments dos invoices deste estimate
        let estPayments: PaymentType[] = [];
        if (estInvoiceIds.length > 0) {
          const estPayLinks = payLinks.filter((l) => estInvoiceIds.includes(l.txn_id));
          estPayments = payments.filter((p) => estPayLinks.some((l) => l.payment_id === p.id));
        }
        return {
          estimate: est,
          lines: lines ? lines.filter((l) => l.estimate_id === est.id) : [],
          links: links ? links.filter((l) => l.estimate_id === est.id) : [],
          bills: estBills,
          payments: estPayments,
          invoices: estInvoices // <-- Agora correto
        };
      });
      setEstimatesRel(rel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEstimatesRel({ statusFilter, dateFrom, dateTo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    estimatesRel,
    loading,
    error,
    reload: loadEstimatesRel
  };
};

// Função utilitária para extrair nome do projeto
export function getProjectName(rawName?: string | null) {
  if (!rawName) return '';
  const parts = rawName.split(':');
  return parts[parts.length - 1].trim();
}

export default useQuickbooksData; 