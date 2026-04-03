import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class SupabaseClient {
  constructor(company = 'hvac') {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
    );
    this.company = company;
    this.tablePrefix = company === 'hvac' ? 'hvac_' : company === 'framing' ? 'framing_' : 'pcg_';
  }

  // Upsert estimates principais e retorna mapping external_id -> id
  async upsertEstimates(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}estimates`)
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
      .from(`${this.tablePrefix}estimate_lines`)
      .upsert(linesRows, { onConflict: 'estimate_id,line_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert links de estimate
  async upsertEstimateLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}estimate_links`)
      .upsert(linksRows, { onConflict: 'estimate_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert invoices principais e retorna mapping external_id -> id
  async upsertInvoices(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}invoices`)
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
      .from(`${this.tablePrefix}invoice_lines`)
      .upsert(linesRows, { onConflict: 'invoice_id,external_line_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert links de invoice
  async upsertInvoiceLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}invoice_links`)
      .upsert(linksRows, { onConflict: 'invoice_id,linked_txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert bills principais e retorna mapping external_id -> id
  async upsertBills(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}bills`)
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
      .from(`${this.tablePrefix}bill_lines`)
      .upsert(linesRows, { onConflict: 'bill_id,line_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert links de bill
  async upsertBillLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}bill_links`)
      .upsert(linksRows, { onConflict: 'bill_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert payments principais e retorna mapping external_id -> id
  async upsertPayments(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}payments`)
      .upsert(mainRows, { onConflict: 'id', ignoreDuplicates: false })
      .select('id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.id] = row.id;
    }
    return idMap;
  }

  // Upsert links de payment
  async upsertPaymentLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}payment_links`)
      .upsert(linksRows, { onConflict: 'payment_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert bill payments principais e retorna mapping external_id -> id
  async upsertBillPayments(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}bill_payments`)
      .upsert(mainRows, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    if (error) throw error;
    const idMap = {};
    for (const row of data) {
      idMap[row.external_id] = row.id;
    }
    return idMap;
  }

  // Upsert links de bill payment
  async upsertBillPaymentLinks(linksRows) {
    if (!linksRows || linksRows.length === 0) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}bill_payment_links`)
      .upsert(linksRows, { onConflict: 'bill_payment_id,txn_id', ignoreDuplicates: false });
    if (error) throw error;
  }

  // Upsert purchases principais e retorna mapping external_id -> id
  async upsertPurchases(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}purchases`)
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
      .from(`${this.tablePrefix}purchase_lines`)
      .upsert(linesRows, { onConflict: 'purchase_id,external_line_id', ignoreDuplicates: false });
    if (error) throw error;
  }
  
  // Método auxiliar para deletar e inserir linhas
  async processLinesWithDeleteInsert(linesRows) {
    console.log('🔄 Usando método delete + insert...');
    for (const line of linesRows) {
      // Deletar registros existentes com mesmo purchase_id e external_line_id
      await this.supabase
        .from(`${this.tablePrefix}purchase_lines`)
        .delete()
        .eq('purchase_id', line.purchase_id)
        .eq('external_line_id', line.external_line_id);
      
      // Inserir novo registro
      const { error: insertError } = await this.supabase
        .from(`${this.tablePrefix}purchase_lines`)
        .insert(line);
      
      if (insertError) {
        console.error('❌ Erro ao inserir linha:', insertError);
        throw insertError;
      }
    }
    console.log('✅ Linhas processadas usando delete + insert');
  }

  // Upsert vendor credits principais e retorna mapping external_id -> id
  async upsertVendorCredits(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}vendor_credits`)
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
    
    try {
      // Filtrar linhas que têm external_line_id (não null)
      const linesWithExternalId = linesRows.filter(line => line.external_line_id != null);
      const linesWithoutExternalId = linesRows.filter(line => line.external_line_id == null);
      
      console.log(`📊 Processando ${linesWithExternalId.length} linhas com external_line_id e ${linesWithoutExternalId.length} sem external_line_id`);
      
      // Processar linhas com external_line_id usando upsert
      if (linesWithExternalId.length > 0) {
        try {
          const { error } = await this.supabase
            .from(`${this.tablePrefix}vendor_credit_lines`)
            .upsert(linesWithExternalId, { onConflict: 'vendor_credit_id,external_line_id', ignoreDuplicates: false });
          
          if (error) {
            console.log('⚠️ Constraint vendor_credit_id,external_line_id não encontrada. Usando método alternativo...');
            await this.processVendorCreditLinesWithDeleteInsert(linesWithExternalId);
          } else {
            console.log(`✅ ${linesWithExternalId.length} linhas upserted com sucesso`);
          }
        } catch (error) {
          console.log('⚠️ Erro no upsert, usando método alternativo...');
          await this.processVendorCreditLinesWithDeleteInsert(linesWithExternalId);
        }
      }
      
      // Processar linhas sem external_line_id usando insert simples
      if (linesWithoutExternalId.length > 0) {
        console.log('📝 Inserindo linhas sem external_line_id...');
        const { error: insertError } = await this.supabase
          .from(`${this.tablePrefix}vendor_credit_lines`)
          .insert(linesWithoutExternalId);
        
        if (insertError) {
          console.error('❌ Erro ao inserir linhas sem external_line_id:', insertError);
          throw insertError;
        }
        console.log(`✅ ${linesWithoutExternalId.length} linhas sem external_line_id inseridas`);
      }
      
    } catch (error) {
      throw error;
    }
  }
  
  // Método auxiliar para deletar e inserir linhas de vendor credit
  async processVendorCreditLinesWithDeleteInsert(linesRows) {
    console.log('🔄 Usando método delete + insert...');
    for (const line of linesRows) {
      // Deletar registros existentes com mesmo vendor_credit_id e external_line_id
      await this.supabase
        .from(`${this.tablePrefix}vendor_credit_lines`)
        .delete()
        .eq('vendor_credit_id', line.vendor_credit_id)
        .eq('external_line_id', line.external_line_id);
      
      // Inserir novo registro
      const { error: insertError } = await this.supabase
        .from(`${this.tablePrefix}vendor_credit_lines`)
        .insert(line);
      
      if (insertError) {
        console.error('❌ Erro ao inserir linha:', insertError);
        throw insertError;
      }
    }
    console.log('✅ Linhas processadas usando delete + insert');
  }

  // Upsert deposits principais e retorna mapping external_id -> id
  async upsertDeposits(mainRows) {
    if (!mainRows || mainRows.length === 0) return {};
    const { data, error } = await this.supabase
      .from(`${this.tablePrefix}deposits`)
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
    
    try {
      // Filtrar linhas que têm external_line_id (não null)
      const linesWithExternalId = linesRows.filter(line => line.external_line_id != null);
      const linesWithoutExternalId = linesRows.filter(line => line.external_line_id == null);
      
      console.log(`📊 Processando ${linesWithExternalId.length} linhas com external_line_id e ${linesWithoutExternalId.length} sem external_line_id`);
      
      // Processar linhas com external_line_id usando upsert
      if (linesWithExternalId.length > 0) {
        try {
          const { error } = await this.supabase
            .from(`${this.tablePrefix}deposit_lines`)
            .upsert(linesWithExternalId, { onConflict: 'deposit_id,external_line_id', ignoreDuplicates: false });
          
          if (error) {
            console.log('⚠️ Constraint deposit_id,external_line_id não encontrada. Usando método alternativo...');
            await this.processDepositLinesWithDeleteInsert(linesWithExternalId);
          } else {
            console.log(`✅ ${linesWithExternalId.length} linhas upserted com sucesso`);
          }
        } catch (error) {
          console.log('⚠️ Erro no upsert, usando método alternativo...');
          await this.processDepositLinesWithDeleteInsert(linesWithExternalId);
        }
      }
      
      // Processar linhas sem external_line_id usando insert simples
      if (linesWithoutExternalId.length > 0) {
        console.log('📝 Inserindo linhas sem external_line_id...');
        const { error: insertError } = await this.supabase
          .from(`${this.tablePrefix}deposit_lines`)
          .insert(linesWithoutExternalId);
        
        if (insertError) {
          console.error('❌ Erro ao inserir linhas sem external_line_id:', insertError);
          throw insertError;
        }
        console.log(`✅ ${linesWithoutExternalId.length} linhas sem external_line_id inseridas`);
      }
      
    } catch (error) {
      throw error;
    }
  }
  
  // Método auxiliar para deletar e inserir linhas de deposit
  async processDepositLinesWithDeleteInsert(linesRows) {
    console.log('🔄 Usando método delete + insert...');
    for (const line of linesRows) {
      // Deletar registros existentes com mesmo deposit_id e external_line_id
      await this.supabase
        .from(`${this.tablePrefix}deposit_lines`)
        .delete()
        .eq('deposit_id', line.deposit_id)
        .eq('external_line_id', line.external_line_id);
      
      // Inserir novo registro
      const { error: insertError } = await this.supabase
        .from(`${this.tablePrefix}deposit_lines`)
        .insert(line);
      
      if (insertError) {
        console.error('❌ Erro ao inserir linha:', insertError);
        throw insertError;
      }
    }
    console.log('✅ Linhas processadas usando delete + insert');
  }

  // Deleta todas as linhas de um bill
  async deleteBillLines(bill_id) {
    if (!bill_id) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}bill_lines`)
      .delete()
      .eq('bill_id', bill_id);
    if (error) throw error;
  }

  // Deleta todos os links de um bill
  async deleteBillLinks(bill_id) {
    if (!bill_id) return;
    const { error } = await this.supabase
      .from(`${this.tablePrefix}bill_links`)
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
    return [`${this.tablePrefix}estimates`, `${this.tablePrefix}invoices`, `${this.tablePrefix}payments`, `${this.tablePrefix}bills`, `${this.tablePrefix}bill_payments`];
  }

  async getEntityTableMapping() {
    return {
      'Estimate': `${this.tablePrefix}estimates`,
      'Invoice': `${this.tablePrefix}invoices`,
      'Payment': `${this.tablePrefix}payments`,
      'Bill': `${this.tablePrefix}bills`,
      'BillPayment': `${this.tablePrefix}bill_payments`
    };
  }
}

export default SupabaseClient;