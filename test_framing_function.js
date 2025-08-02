import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function testFramingFunction() {
  try {
    console.log('🧪 Testando função da Framing...');
    
    // Teste 1: Sem filtros
    console.log('\n1. Teste sem filtros:');
    const { data: data1, error: error1 } = await supabase.rpc('get_framing_project_chart_data', {
      p_selected_year: null,
      p_selected_month: null,
      p_selected_group: 'all'
    });
    console.log('Resultado:', data1);
    if (error1) console.error('Erro:', error1);
    
    // Teste 2: Com ano apenas
    console.log('\n2. Teste com ano 2025:');
    const { data: data2, error: error2 } = await supabase.rpc('get_framing_project_chart_data', {
      p_selected_year: '2025',
      p_selected_month: null,
      p_selected_group: 'all'
    });
    console.log('Resultado:', data2);
    if (error2) console.error('Erro:', error2);
    
    // Teste 3: Com ano e mês
    console.log('\n3. Teste com ano 2025 e mês 01:');
    const { data: data3, error: error3 } = await supabase.rpc('get_framing_project_chart_data', {
      p_selected_year: '2025',
      p_selected_month: '01',
      p_selected_group: 'all'
    });
    console.log('Resultado:', data3);
    if (error3) console.error('Erro:', error3);
    
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

testFramingFunction(); 