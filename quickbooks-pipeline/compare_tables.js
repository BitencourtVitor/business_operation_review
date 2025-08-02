import SupabaseClient from './supabaseClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function compareTables() {
  console.log('🔍 Comparando tabelas HVAC vs FRAMING...\n');
  
  const hvacClient = new SupabaseClient('hvac');
  const framingClient = new SupabaseClient('framing');
  
  const tables = [
    'bills',
    'bill_lines', 
    'bill_links',
    'bill_payments',
    'bill_payment_links',
    'estimates',
    'estimate_lines',
    'estimate_links',
    'invoices',
    'invoice_lines',
    'invoice_links',
    'payments',
    'payment_links',
    'purchases',
    'purchase_lines',
    'vendor_credits',
    'vendor_credit_lines',
    'deposits',
    'deposit_lines'
  ];
  
  for (const table of tables) {
    console.log(`\n=== ${table.toUpperCase()} ===`);
    
    // Testar HVAC
    try {
      const { data: hvacData, error: hvacError } = await hvacClient.supabase
        .from(`hvac_${table}`)
        .select('count(*)', { count: 'exact', head: true });
      
      if (hvacError) {
        console.log(`❌ HVAC ${table}: ${hvacError.message}`);
      } else {
        console.log(`✅ HVAC ${table}: ${hvacData[0]?.count || 0} registros`);
      }
    } catch (err) {
      console.log(`❌ HVAC ${table}: ${err.message}`);
    }
    
    // Testar FRAMING
    try {
      const { data: framingData, error: framingError } = await framingClient.supabase
        .from(`framing_${table}`)
        .select('count(*)', { count: 'exact', head: true });
      
      if (framingError) {
        console.log(`❌ FRAMING ${table}: ${framingError.message}`);
      } else {
        console.log(`✅ FRAMING ${table}: ${framingData[0]?.count || 0} registros`);
      }
    } catch (err) {
      console.log(`❌ FRAMING ${table}: ${err.message}`);
    }
  }
  
  // Testar uma query específica para ver o erro detalhado
  console.log('\n=== TESTE DETALHADO ===');
  try {
    const { data, error } = await framingClient.supabase
      .from('framing_bills')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('❌ Erro detalhado FRAMING_BILLS:', error);
    } else {
      console.log('✅ FRAMING_BILLS funciona');
    }
  } catch (err) {
    console.log('❌ Erro geral FRAMING_BILLS:', err.message);
  }
}

compareTables(); 