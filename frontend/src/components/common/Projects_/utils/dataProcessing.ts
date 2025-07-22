import { getProjectName } from './projectUtils';

// Tipos baseados no robusto
export interface Bill {
  id: string;
  doc_number?: string | null;
  external_id?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
  lines: Array<{ id: string; description: string | null; amount: number | null; account_ref_name?: string | null }>;
  bill_payments: Array<{ id: string; doc_number?: string | null; total_amount?: number | null; txn_date?: string | null; private_note?: string | null }>;
}

export interface Invoice {
  id: string;
  doc_number?: string | null;
  total_amount?: number | null;
  txn_date?: string | null;
  payments?: Array<{ id: string; total_amount?: number | null; txn_date?: string | null; payment_ref?: string | null; private_note?: string | null }>;
}

export interface EstimateLine {
  id: string;
  description: string | null;
  amount: number | null;
}

export interface ProjectRelational {
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
  lines: EstimateLine[];
  bills: Bill[];
  invoices: Invoice[];
  payments: any[];
}

export function processProjectData({
  estimates,
  estimate_lines,
  bills,
  bill_lines,
  bill_payments,
  bill_payment_links,
  bill_links,
  invoices,
  payments,
  payment_links,
  dateFrom,
  dateTo
}: {
  estimates: any[];
  estimate_lines: any[];
  bills: any[];
  bill_lines: any[];
  bill_payments: any[];
  bill_payment_links: any[];
  bill_links: any[];
  invoices: any[];
  payments: any[];
  payment_links: any[];
  dateFrom: string;
  dateTo: string;
}): ProjectRelational[] {
  // Mapas auxiliares
  const billsById = new Map<string, any>();
  bills.forEach((bill) => billsById.set(bill.id, bill));
  const invoicesByCustomer = new Map<string, any[]>();
  invoices.forEach((inv) => {
    if (!inv.customer_id || !inv.customer_name) return;
    const key = inv.customer_id + '|' + inv.customer_name;
    if (!invoicesByCustomer.has(key)) invoicesByCustomer.set(key, []);
    invoicesByCustomer.get(key)!.push(inv);
  });
  const paymentLinksByTxnIdType = new Map<string, any[]>();
  payment_links.forEach((link) => {
    if (!link.txn_id || !link.txn_type) return;
    const key = link.txn_id + '|' + link.txn_type;
    if (!paymentLinksByTxnIdType.has(key)) paymentLinksByTxnIdType.set(key, []);
    paymentLinksByTxnIdType.get(key)!.push(link);
  });
  const paymentsById = new Map<string, any>();
  payments.forEach((p) => paymentsById.set(p.id, p));
  const billPaymentsById = new Map<string, any>();
  bill_payments.forEach((bp) => billPaymentsById.set(bp.id, bp));
  const billPaymentLinksByTxnId = new Map<string, any[]>();
  bill_payment_links.forEach((link) => {
    if (!link.txn_id) return;
    if (!billPaymentLinksByTxnId.has(link.txn_id)) billPaymentLinksByTxnId.set(link.txn_id, []);
    billPaymentLinksByTxnId.get(link.txn_id)!.push(link);
  });
  const billLinksByTxnId = new Map<string, any[]>();
  bill_links.forEach((link) => {
    if (!link.txn_id) return;
    if (!billLinksByTxnId.has(link.txn_id)) billLinksByTxnId.set(link.txn_id, []);
    billLinksByTxnId.get(link.txn_id)!.push(link);
  });

  return estimates.map((est) => {
    // Linhas do estimate
    const lines = estimate_lines.filter((l) => l.estimate_id === est.id);
    // Bills: buscar bill_lines com mesmo customer_id OU customer_name
    let billLines = bill_lines.filter((line) => {
      const bill = billsById.get(line.bill_id);
      if (bill && bill.txn_date) {
        const billDate = new Date(bill.txn_date);
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        if (billDate < fromDate || billDate > toDate) return false;
      }
      if (est.customer_id && est.customer_name && line.customer_id && line.customer_name) {
        return line.customer_id === est.customer_id && line.customer_name === est.customer_name;
      }
      if (est.customer_id && line.customer_id) {
        return line.customer_id === est.customer_id;
      }
      if (est.customer_name && line.customer_name) {
        return line.customer_name === est.customer_name;
      }
      return false;
    });
    // Bill links (conexão direta)
    const billLinksForEstimate = billLinksByTxnId.get(est.external_id) || [];
    const billIdsFromLinks = new Set(billLinksForEstimate.map((link) => link.bill_id));
    const additionalBillLines = bill_lines.filter((line) => {
      const bill = billsById.get(line.bill_id);
      if (bill && bill.txn_date) {
        const billDate = new Date(bill.txn_date);
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        if (billDate < fromDate || billDate > toDate) return false;
      }
      return billIdsFromLinks.has(line.bill_id);
    });
    // Bill lines por account_ref_name
    const projectNameFromEstimate = getProjectName(est.customer_name);
    const additionalBillLinesByAccount = bill_lines.filter((line) => {
      const bill = billsById.get(line.bill_id);
      if (bill && bill.txn_date) {
        const billDate = new Date(bill.txn_date);
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        if (billDate < fromDate || billDate > toDate) return false;
      }
      if (!line.account_ref_name || !projectNameFromEstimate) return false;
      return line.account_ref_name.toLowerCase().includes(projectNameFromEstimate.toLowerCase()) ||
        projectNameFromEstimate.toLowerCase().includes(line.account_ref_name.toLowerCase());
    });
    // Bill lines de projetos similares
    const additionalBillLinesBySimilarCustomer = bill_lines.filter((line) => {
      const bill = billsById.get(line.bill_id);
      if (bill && bill.txn_date) {
        const billDate = new Date(bill.txn_date);
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        if (billDate < fromDate || billDate > toDate) return false;
      }
      if (!est.customer_id || !line.customer_id) return false;
      return line.customer_id === est.customer_id && line.customer_name !== est.customer_name;
    });
    // Combinar e remover duplicatas
    const allBillLines = [...billLines, ...additionalBillLines, ...additionalBillLinesByAccount, ...additionalBillLinesBySimilarCustomer];
    const uniqueBillLines = allBillLines.filter((line, index, self) =>
      index === self.findIndex(l => l.id === line.id)
    );
    billLines = uniqueBillLines;
    // Agrupar bill lines por bill_id
    const billLinesByBillId = new Map<string, typeof billLines>();
    billLines.forEach((line) => {
      if (!billLinesByBillId.has(line.bill_id)) billLinesByBillId.set(line.bill_id, []);
      billLinesByBillId.get(line.bill_id)!.push(line);
    });
    // Para cada bill, pegar todas as suas bill_lines
    const billsArr = Array.from(billLinesByBillId.entries()).map(([billId, lines]) => {
      const bill = billsById.get(billId);
      if (!bill) return null;
      // Bill payments
      const billPaymentLinks = billPaymentLinksByTxnId.get(bill.external_id) || [];
      const billPayments = billPaymentLinks.map((link) => {
        const billPayment = billPaymentsById.get(link.bill_payment_id);
        return billPayment ? {
          id: billPayment.id,
          doc_number: billPayment.doc_number,
          total_amount: billPayment.total_amount,
          txn_date: billPayment.txn_date,
          private_note: billPayment.private_note
        } : null;
      }).filter((bp) => bp !== null);
      return {
        bill: {
          id: bill.id,
          doc_number: bill.doc_number || '',
          external_id: bill.external_id,
          total_amount: bill.total_amount || 0,
          txn_date: bill.txn_date
        },
        lines: lines.map((line) => ({
          id: line.id,
          description: line.description,
          amount: line.amount,
          account_ref_name: line.account_ref_name
        })),
        bill_payments: billPayments
      };
    }).filter((b) => b !== null);
    // Invoices
    const invoicesArr = (invoicesByCustomer.get(est.customer_id + '|' + est.customer_name) || []).map((inv) => {
      const paymentLinks = paymentLinksByTxnIdType.get(inv.external_id + '|Invoice') || [];
      const paymentsArr = paymentLinks.map((pl) => pl.payment_id ? paymentsById.get(pl.payment_id) : undefined).filter((p) => !!p);
      return { ...inv, payments: paymentsArr };
    });
    // Payments dos invoices deste estimate
    const paymentsArr: any[] = [];
    invoicesArr.forEach((inv) => {
      if (Array.isArray(inv.payments)) {
        inv.payments.forEach((p: any) => {
          if (!paymentsArr.find(x => x.id === p.id)) paymentsArr.push(p);
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
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        amount: l.amount
      })),
      bills: billsArr,
      invoices: invoicesArr,
      payments: paymentsArr
    };
  });
} 