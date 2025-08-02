import SupabaseClient from './supabaseClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSimpleQuery() {
  console.log('🔍 Testando query simples...\n');
  
  const sb = new SupabaseClient('framing');
  
  try {
    // Testar uma query simples
    const { data, error } = await sb.supabase
      .from('hvac_bills')
      .select('count(*)', { count: 'exact', head: true });
    
    if (error) {
      console.log('❌ Erro na query hvac_bills:', error.message);
    } else {
      console.log('✅ hvac_bills funciona:', data[0]?.count || 0, 'registros');
    }
    
    // Testar framing_bills
    const { data: framingData, error: framingError } = await sb.supabase
      .from('framing_bills')
      .select('count(*)', { count: 'exact', head: true });
    
    if (framingError) {
      console.log('❌ Erro na query framing_bills:', framingError.message);
    } else {
      console.log('✅ framing_bills funciona:', framingData[0]?.count || 0, 'registros');
    }
    
  } catch (err) {
    console.log('❌ Erro geral:', err.message);
  }
}

testSimpleQuery(); 