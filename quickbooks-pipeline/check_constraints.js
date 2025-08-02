import SupabaseClient from './supabaseClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkConstraints() {
  console.log('🔍 Verificando constraints das tabelas FRAMING...\n');
  
  const sb = new SupabaseClient('framing');
  
  // Testar upsert em bills (que funciona)
  console.log('=== TESTE UPSERT BILLS ===');
  try {
    const testBill = {
      external_id: 'test_bill_123',
      updated_at: new Date().toISOString(),
      doc_number: 'TEST001',
      txn_date: '2025-01-01',
      vendor_id: 'test_vendor',
      vendor_name: 'Test Vendor',
      total_amount: 100.00,
      balance: 100.00
    };
    
    const { data, error } = await sb.supabase
      .from('framing_bills')
      .upsert(testBill, { onConflict: 'external_id', ignoreDuplicates: false })
      .select('id, external_id');
    
    if (error) {
      console.log('❌ Erro no upsert bills:', error.message);
    } else {
      console.log('✅ Upsert bills funciona');
    }
  } catch (err) {
    console.log('❌ Erro geral bills:', err.message);
  }
  
  // Testar upsert em bill_lines (que falha)
  console.log('\n=== TESTE UPSERT BILL_LINES ===');
  try {
    const testBillLine = {
      bill_id: '00000000-0000-0000-0000-000000000000', // UUID fake
      line_id: 'test_line_123',
      description: 'Test Line',
      amount: 50.00,
      account_ref_id: 'test_account',
      account_ref_name: 'Test Account'
    };
    
    const { data, error } = await sb.supabase
      .from('framing_bill_lines')
      .upsert(testBillLine, { onConflict: 'bill_id,line_id', ignoreDuplicates: false })
      .select('id');
    
    if (error) {
      console.log('❌ Erro no upsert bill_lines:', error.message);
    } else {
      console.log('✅ Upsert bill_lines funciona');
    }
  } catch (err) {
    console.log('❌ Erro geral bill_lines:', err.message);
  }
  
  // Testar upsert em bill_links (que falha)
  console.log('\n=== TESTE UPSERT BILL_LINKS ===');
  try {
    const testBillLink = {
      bill_id: '00000000-0000-0000-0000-000000000000', // UUID fake
      txn_id: 'test_txn_123',
      txn_type: 'test_type'
    };
    
    const { data, error } = await sb.supabase
      .from('framing_bill_links')
      .upsert(testBillLink, { onConflict: 'bill_id,txn_id', ignoreDuplicates: false })
      .select('id');
    
    if (error) {
      console.log('❌ Erro no upsert bill_links:', error.message);
    } else {
      console.log('✅ Upsert bill_links funciona');
    }
  } catch (err) {
    console.log('❌ Erro geral bill_links:', err.message);
  }
}

checkConstraints(); 