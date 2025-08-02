import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function testNoFilters() {
  try {
    console.log('🧪 Testando função sem filtros...');
    
    // Teste HVAC sem filtros
    console.log('\n1. HVAC sem filtros:');
    const { data: hvacData, error: hvacError } = await supabase.rpc('get_project_chart_data', {
      p_selected_year: null,
      p_selected_month: null,
      p_selected_group: 'all'
    });
    console.log('HVAC resultado:', hvacData?.length || 0, 'registros');
    if (hvacError) console.error('HVAC erro:', hvacError);
    
    // Teste Framing sem filtros
    console.log('\n2. Framing sem filtros:');
    const { data: framingData, error: framingError } = await supabase.rpc('get_framing_project_chart_data', {
      p_selected_year: null,
      p_selected_month: null,
      p_selected_group: 'all'
    });
    console.log('Framing resultado:', framingData?.length || 0, 'registros');
    if (framingError) console.error('Framing erro:', framingError);
    
    // Mostrar alguns exemplos dos dados
    if (hvacData && hvacData.length > 0) {
      console.log('\n3. Exemplos HVAC (primeiros 5):');
      hvacData.slice(0, 5).forEach(item => {
        console.log(`  ${item.period_label}: Receivable=${item.receivable_amount}, Payable=${item.payable_amount}`);
      });
    }
    
    if (framingData && framingData.length > 0) {
      console.log('\n4. Exemplos Framing (primeiros 5):');
      framingData.slice(0, 5).forEach(item => {
        console.log(`  ${item.period_label}: Receivable=${item.receivable_amount}, Payable=${item.payable_amount}`);
      });
    }
    
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

testNoFilters(); 