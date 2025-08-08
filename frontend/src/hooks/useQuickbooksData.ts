import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Tipos para HVAC
export interface HvacBillLine {
  id: string;
  bill_id: string;
  line_id: string | null;
  description: string | null;
  amount: number | null;
  account_ref_id: string | null;
  account_ref_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
}
export interface HvacBillLink {
  id: string;
  bill_id: string;
  txn_id: string;
  txn_type: string | null;
  created_at: string | null;
}
export interface HvacBillPaymentLink {
  id: string;
  bill_payment_id: string;
  txn_id: string;
  txn_type: string;
  amount: number;
}
export interface HvacBillPayment {
  id: string;
  external_id: string | null;
  vendor_id: string;
  vendor_name: string | null;
  pay_type: string;
  total_amount: number;
  currency: string | null;
  txn_date: string | null;
  doc_number: string | null;
  private_note: string | null;
  bank_account_id: string | null;
  bank_account_name: string | null;
  cc_account_id: string | null;
  cc_account_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface HvacBill {
  id: string;
  external_id: string;
  updated_at: string;
  created_at: string | null;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  balance: number | null;
}
export interface HvacEstimateLine {
  id: string;
  estimate_id: string;
  line_id: string | null;
  line_num: number | null;
  description: string | null;
  amount: number | null;
  unit_price: number | null;
  quantity: number | null;
  item_ref_id: string | null;
  item_ref_name: string | null;
  tax_code_ref: string | null;
  detail_type: string | null;
  created_at: string | null;
}
export interface HvacEstimateLink {
  id: string;
  estimate_id: string;
  txn_id: string;
  txn_type: string | null;
  created_at: string | null;
}
export interface HvacEstimate {
  id: string;
  external_id: string;
  updated_at: string;
  created_at: string | null;
  doc_number: string | null;
  txn_date: string | null;
  txn_status: string | null;
  accepted_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
}
export interface HvacInvoiceLine {
  id: string;
  invoice_id: string;
  external_line_id: string | null;
  description: string | null;
  amount: number | null;
  created_at: string | null;
}
export interface HvacInvoiceLink {
  id: string;
  invoice_id: string;
  linked_txn_id: string;
  linked_txn_type: string | null;
  created_at: string | null;
}
export interface HvacInvoice {
  id: string;
  external_id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  balance: number | null;
  last_updated_at: string | null;
  created_at: string | null;
}
export interface HvacPaymentLink {
  payment_id: string | null;
  txn_id: string | null;
  txn_type: string | null;
  amount: number | null;
  open_balance: number | null;
  reference_number: string | null;
}
export interface HvacPayment {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  currency: string | null;
  payment_ref: string | null;
  payment_method_id: string | null;
  deposit_account_id: string | null;
  private_note: string | null;
  txn_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Tipos para Framing (mesma estrutura que HVAC)
export interface FramingBillLine {
  id: string;
  bill_id: string;
  line_id: string | null;
  description: string | null;
  amount: number | null;
  account_ref_id: string | null;
  account_ref_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
}
export interface FramingBillLink {
  id: string;
  bill_id: string;
  txn_id: string;
  txn_type: string | null;
  created_at: string | null;
}
export interface FramingBillPaymentLink {
  id: string;
  bill_payment_id: string;
  txn_id: string;
  txn_type: string;
  amount: number;
}
export interface FramingBillPayment {
  id: string;
  external_id: string | null;
  vendor_id: string;
  vendor_name: string | null;
  pay_type: string;
  total_amount: number;
  currency: string | null;
  txn_date: string | null;
  doc_number: string | null;
  private_note: string | null;
  bank_account_id: string | null;
  bank_account_name: string | null;
  cc_account_id: string | null;
  cc_account_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface FramingBill {
  id: string;
  external_id: string;
  updated_at: string;
  created_at: string | null;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  balance: number | null;
}
export interface FramingEstimateLine {
  id: string;
  estimate_id: string;
  line_id: string | null;
  line_num: number | null;
  description: string | null;
  amount: number | null;
  unit_price: number | null;
  quantity: number | null;
  item_ref_id: string | null;
  item_ref_name: string | null;
  tax_code_ref: string | null;
  detail_type: string | null;
  created_at: string | null;
}
export interface FramingEstimateLink {
  id: string;
  estimate_id: string;
  txn_id: string;
  txn_type: string | null;
  created_at: string | null;
}
export interface FramingEstimate {
  id: string;
  external_id: string;
  updated_at: string;
  created_at: string | null;
  doc_number: string | null;
  txn_date: string | null;
  txn_status: string | null;
  accepted_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
}
export interface FramingInvoiceLine {
  id: string;
  invoice_id: string;
  external_line_id: string | null;
  description: string | null;
  amount: number | null;
  created_at: string | null;
}
export interface FramingInvoiceLink {
  id: string;
  invoice_id: string;
  linked_txn_id: string;
  linked_txn_type: string | null;
  created_at: string | null;
}
export interface FramingInvoice {
  id: string;
  external_id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  balance: number | null;
  last_updated_at: string | null;
  created_at: string | null;
}
export interface FramingPaymentLink {
  payment_id: string | null;
  txn_id: string | null;
  txn_type: string | null;
  amount: number | null;
  open_balance: number | null;
  reference_number: string | null;
}
export interface FramingPayment {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  currency: string | null;
  payment_ref: string | null;
  payment_method_id: string | null;
  deposit_account_id: string | null;
  private_note: string | null;
  txn_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Interfaces PCG (seguindo o mesmo padrão das interfaces Framing)
export interface PcgBillLine {
  id: string;
  bill_id: string;
  line_id: string | null;
  description: string | null;
  amount: number | null;
  account_ref_id: string | null;
  account_ref_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

export interface PcgBillLink {
  id: string;
  bill_id: string;
  txn_id: string;
  txn_type: string | null;
  created_at: string | null;
}

export interface PcgBillPaymentLink {
  id: string;
  bill_payment_id: string;
  txn_id: string;
  txn_type: string;
  amount: number;
}

export interface PcgBillPayment {
  id: string;
  external_id: string | null;
  vendor_id: string;
  vendor_name: string | null;
  pay_type: string;
  total_amount: number;
  currency: string | null;
  txn_date: string | null;
  doc_number: string | null;
  private_note: string | null;
  bank_account_id: string | null;
  bank_account_name: string | null;
  cc_account_id: string | null;
  cc_account_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PcgBill {
  id: string;
  external_id: string;
  updated_at: string;
  created_at: string | null;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  balance: number | null;
}

export interface PcgEstimateLine {
  id: string;
  estimate_id: string;
  line_id: string | null;
  line_num: number | null;
  description: string | null;
  amount: number | null;
  unit_price: number | null;
  quantity: number | null;
  item_ref_id: string | null;
  item_ref_name: string | null;
  tax_code_ref: string | null;
  detail_type: string | null;
  created_at: string | null;
}

export interface PcgEstimateLink {
  id: string;
  estimate_id: string;
  txn_id: string;
  txn_type: string | null;
  created_at: string | null;
}

export interface PcgEstimate {
  id: string;
  external_id: string;
  updated_at: string;
  created_at: string | null;
  doc_number: string | null;
  txn_date: string | null;
  txn_status: string | null;
  accepted_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
}

export interface PcgInvoiceLine {
  id: string;
  invoice_id: string;
  external_line_id: string | null;
  description: string | null;
  amount: number | null;
  created_at: string | null;
}

export interface PcgInvoiceLink {
  id: string;
  invoice_id: string;
  linked_txn_id: string;
  linked_txn_type: string | null;
  created_at: string | null;
}

export interface PcgInvoice {
  id: string;
  external_id: string;
  doc_number: string | null;
  txn_date: string | null;
  due_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  balance: number | null;
  last_updated_at: string | null;
  created_at: string | null;
}

export interface PcgPaymentLink {
  payment_id: string | null;
  txn_id: string | null;
  txn_type: string | null;
  amount: number | null;
  open_balance: number | null;
  reference_number: string | null;
}

export interface PcgPayment {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  currency: string | null;
  payment_ref: string | null;
  payment_method_id: string | null;
  deposit_account_id: string | null;
  private_note: string | null;
  txn_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface HvacData {
  hvac_bill_lines: HvacBillLine[];
  hvac_bill_links: HvacBillLink[];
  hvac_bill_payment_links: HvacBillPaymentLink[];
  hvac_bill_payments: HvacBillPayment[];
  hvac_bills: HvacBill[];
  hvac_estimate_lines: HvacEstimateLine[];
  hvac_estimate_links: HvacEstimateLink[];
  hvac_estimates: HvacEstimate[];
  hvac_invoice_lines: HvacInvoiceLine[];
  hvac_invoice_links: HvacInvoiceLink[];
  hvac_invoices: HvacInvoice[];
  hvac_payment_links: HvacPaymentLink[];
  hvac_payments: HvacPayment[];
}

export interface FramingData {
  framing_bill_lines: FramingBillLine[];
  framing_bill_links: FramingBillLink[];
  framing_bill_payment_links: FramingBillPaymentLink[];
  framing_bill_payments: FramingBillPayment[];
  framing_bills: FramingBill[];
  framing_estimate_lines: FramingEstimateLine[];
  framing_estimate_links: FramingEstimateLink[];
  framing_estimates: FramingEstimate[];
  framing_invoice_lines: FramingInvoiceLine[];
  framing_invoice_links: FramingInvoiceLink[];
  framing_invoices: FramingInvoice[];
  framing_payment_links: FramingPaymentLink[];
  framing_payments: FramingPayment[];
}

export interface PcgData {
  pcg_bill_lines: PcgBillLine[];
  pcg_bill_links: PcgBillLink[];
  pcg_bill_payment_links: PcgBillPaymentLink[];
  pcg_bill_payments: PcgBillPayment[];
  pcg_bills: PcgBill[];
  pcg_estimate_lines: PcgEstimateLine[];
  pcg_estimate_links: PcgEstimateLink[];
  pcg_estimates: PcgEstimate[];
  pcg_invoice_lines: PcgInvoiceLine[];
  pcg_invoice_links: PcgInvoiceLink[];
  pcg_invoices: PcgInvoice[];
  pcg_payment_links: PcgPaymentLink[];
  pcg_payments: PcgPayment[];
}

export type CompanyData = HvacData | FramingData | PcgData;

const useQuickbooksData = (company: 'HVAC' | 'Framing' | 'PCG' = 'HVAC') => {
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Função auxiliar para buscar todos os dados com paginação
      const fetchAllData = async (tableName: string) => {
        let allData: unknown[] = [];
        let from = 0;
        const pageSize = 1000;
        
        while (true) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + pageSize - 1);
          
          if (error) throw error;
          if (!data || data.length === 0) break;
          
          allData = [...allData, ...data];
          from += pageSize;
          
          // Se não há mais dados (menos que pageSize registros retornados)
          if (data.length < pageSize) break;
        }
        
        return allData;
      };

      if (company === 'HVAC') {
        const [billLines, billLinks, billPaymentLinks, billPayments, bills, estimateLines, estimateLinks, estimates, invoiceLines, invoiceLinks, invoices, paymentLinks, payments] = await Promise.all([
          fetchAllData('hvac_bill_lines'),
          fetchAllData('hvac_bill_links'),
          fetchAllData('hvac_bill_payment_links'),
          fetchAllData('hvac_bill_payments'),
          fetchAllData('hvac_bills'),
          fetchAllData('hvac_estimate_lines'),
          fetchAllData('hvac_estimate_links'),
          fetchAllData('hvac_estimates'),
          fetchAllData('hvac_invoice_lines'),
          fetchAllData('hvac_invoice_links'),
          fetchAllData('hvac_invoices'),
          fetchAllData('hvac_payment_links'),
          fetchAllData('hvac_payments'),
        ]);
        
        const dataToSet: HvacData = {
          hvac_bill_lines: billLines as HvacBillLine[],
          hvac_bill_links: billLinks as HvacBillLink[],
          hvac_bill_payment_links: billPaymentLinks as HvacBillPaymentLink[],
          hvac_bill_payments: billPayments as HvacBillPayment[],
          hvac_bills: bills as HvacBill[],
          hvac_estimate_lines: estimateLines as HvacEstimateLine[],
          hvac_estimate_links: estimateLinks as HvacEstimateLink[],
          hvac_estimates: estimates as HvacEstimate[],
          hvac_invoice_lines: invoiceLines as HvacInvoiceLine[],
          hvac_invoice_links: invoiceLinks as HvacInvoiceLink[],
          hvac_invoices: invoices as HvacInvoice[],
          hvac_payment_links: paymentLinks as HvacPaymentLink[],
          hvac_payments: payments as HvacPayment[],
        };

        setData(dataToSet);
      } else if (company === 'Framing') {
        const [billLines, billLinks, billPaymentLinks, billPayments, bills, estimateLines, estimateLinks, estimates, invoiceLines, invoiceLinks, invoices, paymentLinks, payments] = await Promise.all([
          fetchAllData('framing_bill_lines'),
          fetchAllData('framing_bill_links'),
          fetchAllData('framing_bill_payment_links'),
          fetchAllData('framing_bill_payments'),
          fetchAllData('framing_bills'),
          fetchAllData('framing_estimate_lines'),
          fetchAllData('framing_estimate_links'),
          fetchAllData('framing_estimates'),
          fetchAllData('framing_invoice_lines'),
          fetchAllData('framing_invoice_links'),
          fetchAllData('framing_invoices'),
          fetchAllData('framing_payment_links'),
          fetchAllData('framing_payments'),
        ]);
        
        const dataToSet: FramingData = {
          framing_bill_lines: billLines as FramingBillLine[],
          framing_bill_links: billLinks as FramingBillLink[],
          framing_bill_payment_links: billPaymentLinks as FramingBillPaymentLink[],
          framing_bill_payments: billPayments as FramingBillPayment[],
          framing_bills: bills as FramingBill[],
          framing_estimate_lines: estimateLines as FramingEstimateLine[],
          framing_estimate_links: estimateLinks as FramingEstimateLink[],
          framing_estimates: estimates as FramingEstimate[],
          framing_invoice_lines: invoiceLines as FramingInvoiceLine[],
          framing_invoice_links: invoiceLinks as FramingInvoiceLink[],
          framing_invoices: invoices as FramingInvoice[],
          framing_payment_links: paymentLinks as FramingPaymentLink[],
          framing_payments: payments as FramingPayment[],
        };

        setData(dataToSet);
      } else if (company === 'PCG') {
        const [billLines, billLinks, billPaymentLinks, billPayments, bills, estimateLines, estimateLinks, estimates, invoiceLines, invoiceLinks, invoices, paymentLinks, payments] = await Promise.all([
          fetchAllData('pcg_bill_lines'),
          fetchAllData('pcg_bill_links'),
          fetchAllData('pcg_bill_payment_links'),
          fetchAllData('pcg_bill_payments'),
          fetchAllData('pcg_bills'),
          fetchAllData('pcg_estimate_lines'),
          fetchAllData('pcg_estimate_links'),
          fetchAllData('pcg_estimates'),
          fetchAllData('pcg_invoice_lines'),
          fetchAllData('pcg_invoice_links'),
          fetchAllData('pcg_invoices'),
          fetchAllData('pcg_payment_links'),
          fetchAllData('pcg_payments'),
        ]);
        
        const dataToSet: PcgData = {
          pcg_bill_lines: billLines as PcgBillLine[],
          pcg_bill_links: billLinks as PcgBillLink[],
          pcg_bill_payment_links: billPaymentLinks as PcgBillPaymentLink[],
          pcg_bill_payments: billPayments as PcgBillPayment[],
          pcg_bills: bills as PcgBill[],
          pcg_estimate_lines: estimateLines as PcgEstimateLine[],
          pcg_estimate_links: estimateLinks as PcgEstimateLink[],
          pcg_estimates: estimates as PcgEstimate[],
          pcg_invoice_lines: invoiceLines as PcgInvoiceLine[],
          pcg_invoice_links: invoiceLinks as PcgInvoiceLink[],
          pcg_invoices: invoices as PcgInvoice[],
          pcg_payment_links: paymentLinks as PcgPaymentLink[],
          pcg_payments: payments as PcgPayment[],
        };

        setData(dataToSet);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, [company]);

  return {
    data,
    loading,
    error,
    reload: loadAllData,
  };
};

export default useQuickbooksData; 