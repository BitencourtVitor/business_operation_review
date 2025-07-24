import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class SupabaseClient {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
  }

  // Upsert estimates principais e retorna mapping external_id -> id
  async upsertEstimates(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from('hvac_estimates')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert linhas de estimate
  async upsertEstimateLines(linesRows) {
    if (!linesRows || linesRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_estimate_lines')
      .upsert(linesRows, { onConflict: 'estimate_id,line_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert links de estimate
  async upsertEstimateLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_estimate_links')
      .upsert(linksRows, { onConflict: 'estimate_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert invoices principais e retorna mapping external_id -> id
  async upsertInvoices(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from('hvac_invoices')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert linhas de invoice
  async upsertInvoiceLines(linesRows) {
    if (!linesRows || linesRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_invoice_lines')
      .upsert(linesRows, { onConflict: 'invoice_id,external_line_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert links de invoice
  async upsertInvoiceLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_invoice_links')
      .upsert(linksRows, { onConflict: 'invoice_id,linked_txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert bills principais e retorna mapping external_id -> id
  async upsertBills(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from('hvac_bills')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert linhas de bill
  async upsertBillLines(linesRows) {
    if (!linesRows || linesRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_bill_lines')
      .upsert(linesRows, { onConflict: 'bill_id,line_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert links de bill
  async upsertBillLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_bill_links')
      .upsert(linksRows, { onConflict: 'bill_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert payments principais
  async upsertPayments(mainRows) {
    if (!mainRows || mainRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_payments')
      .upsert(mainRows, { onConflict: 'id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert payment links
  async upsertPaymentLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_payment_links')
      .upsert(linksRows, { onConflict: 'payment_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert bill payments principais (agora com id UUID autogerado)
  async upsertBillPayments(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    // upsert por external_id para garantir unicidade do registro externo
    const { data, error } = await this.supabase
      .from('hvac_bill_payments')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    // retorna um map external_id -> id (UUID)
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert bill payment links (agora bill_payment_id é UUID)
  async upsertBillPaymentLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_bill_payment_links')
      .upsert(linksRows, { onConflict: 'bill_payment_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert purchases principais e retorna mapping external_id -> id
  async upsertPurchases(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from('hvac_purchases')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert linhas de purchase
  async upsertPurchaseLines(linesRows) {
    if (!linesRows || linesRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_purchase_lines')
      .insert(linesRows);
    if (error) throw error;
  }

  // Upsert vendor credits principais e retorna mapping external_id -> id
  async upsertVendorCredits(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from('hvac_vendor_credits')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert linhas de vendor credit
  async upsertVendorCreditLines(linesRows) {
    if (!linesRows || linesRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_vendor_credit_lines')
      .insert(linesRows);
    if (error) throw error;
  }

  // Upsert deposits principais e retorna mapping external_id -> id
  async upsertDeposits(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from('hvac_deposits')
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert linhas de deposit
  async upsertDepositLines(linesRows) {
    if (!linesRows || linesRows.length === 0) return;
    const { error } = await this.supabase
      .from('hvac_deposit_lines')
      .insert(linesRows);
    if (error) throw error;
  }

  // Deleta todas as linhas de um bill
  async deleteBillLines(bill_id) {
    if (!bill_id) return;
    const { error } = await this.supabase
      .from('hvac_bill_lines')
      .delete()
      .eq('bill_id', bill_id);
    if (error) throw error;
  }

  // Deleta todos os links de um bill
  async deleteBillLinks(bill_id) {
    if (!bill_id) return;
    const { error } = await this.supabase
      .from('hvac_bill_links')
      .delete()
      .eq('bill_id', bill_id);
    if (error) throw error;
  }

  async getLastUpdatedTime(tableName) {
    try {
      const { data, error } = await this.supabase
        .from(tableName)
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error(`Error getting last updated time for ${tableName}:`, error);
        return null;
      }

      return data && data.length > 0 ? data[0].updated_at : null;
    } catch (error) {
      console.error(`Failed to get last updated time for ${tableName}:`, error);
      return null;
    }
  }

  async createTableIfNotExists(tableName) {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT ${tableName}_external_id_unique UNIQUE (external_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_${tableName}_external_id ON ${tableName}(external_id);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at ON ${tableName}(updated_at);
    `;

    try {
      const { error } = await this.supabase.rpc('exec_sql', { sql: createTableSQL });
      
      if (error) {
        console.log(`Table ${tableName} might already exist or error occurred:`, error.message);
      } else {
        console.log(`Table ${tableName} created successfully`);
      }
    } catch (error) {
      console.log(`Table ${tableName} might already exist:`, error.message);
    }
  }

  async getTableNames() {
    return ['hvac_estimates', 'hvac_invoices', 'hvac_payments', 'hvac_bills', 'hvac_bill_payments'];
  }

  async getEntityTableMapping() {
    return {
      'Estimate': 'hvac_estimates',
      'Invoice': 'hvac_invoices',
      'Payment': 'hvac_payments',
      'Bill': 'hvac_bills',
      'BillPayment': 'hvac_bill_payments'
    };
  }
}

export default SupabaseClient;