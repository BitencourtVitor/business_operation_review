import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function testFramingFixed() {
  try {
    console.log('🧪 Testando função da Framing corrigida...');
    
    // Teste com mês 01
    const { data, error } = await supabase.rpc('get_framing_project_chart_data', {
      p_selected_year: '2025',
      p_selected_month: '01',
      p_selected_group: 'all'
    });
    
    console.log('Resultado:', data);
    if (error) console.error('Erro:', error);
    
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

testFramingFixed(); 