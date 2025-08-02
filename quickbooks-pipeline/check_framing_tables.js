import SupabaseClient from './supabaseClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkFramingTables() {
  console.log('🔍 Verificando tabelas FRAMING no banco...\n');
  
  const sb = new SupabaseClient('framing');
  
  const tables = [
    'framing_bills',
    'framing_bill_lines', 
    'framing_bill_links',
    'framing_bill_payments',
    'framing_bill_payment_links',
    'framing_estimates',
    'framing_estimate_lines',
    'framing_estimate_links',
    'framing_invoices',
    'framing_invoice_lines',
    'framing_invoice_links',
    'framing_payments',
    'framing_payment_links',
    'framing_purchases',
    'framing_purchase_lines',
    'framing_vendor_credits',
    'framing_vendor_credit_lines',
    'framing_deposits',
    'framing_deposit_lines'
  ];
  
  for (const table of tables) {
    try {
      const { data, error } = await sb.supabase
        .from(table)
        .select('count(*)', { count: 'exact', head: true });
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: Existe (${data[0]?.count || 0} registros)`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ${err.message}`);
    }
  }
  
  // Testar uma query direta para ver se o problema é de permissões
  console.log('\n🔍 Testando query direta...');
  try {
    const { data, error } = await sb.supabase
      .rpc('get_table_info', { table_name: 'framing_bills' });
    
    if (error) {
      console.log('❌ Erro na query direta:', error.message);
    } else {
      console.log('✅ Query direta funcionou');
    }
  } catch (err) {
    console.log('❌ Erro na query direta:', err.message);
  }
}

checkFramingTables(); 