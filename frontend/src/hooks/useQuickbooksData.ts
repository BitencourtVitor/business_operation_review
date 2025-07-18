import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Tipos completos para cada tabela hvac_
// (Gerados a partir do schema, todos os campos inclusos)

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

const useQuickbooksData = () => {
  const [data, setData] = useState<HvacData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllHvacData = async () => {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAllHvacData();
  }, []);

  return {
    data,
    loading,
    error,
    reload: loadAllHvacData,
  };
};

export default useQuickbooksData; 