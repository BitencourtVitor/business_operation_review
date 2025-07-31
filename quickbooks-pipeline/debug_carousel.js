import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function debugCarouselFunction() {
  try {
    console.log('🔍 Debugando função do carrossel...');
    
    // Teste 1: Verificar se a função existe
    console.log('\n📋 Teste 1: Verificar se a função existe');
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, data_type')
      .eq('routine_name', 'get_project_carousel_data');
    
    if (functionsError) {
      console.log('❌ Erro ao verificar funções:', functionsError.message);
    } else {
      console.log('✅ Funções encontradas:', functions);
    }
    
    // Teste 2: Tentar chamar a função com parâmetros TEXT
    console.log('\n📝 Teste 2: Chamar com parâmetros TEXT');
    const { data: data1, error: error1 } = await supabase.rpc('get_project_carousel_data', {
      p_date_from: '2024-01-01',
      p_date_to: '2024-12-31',
      p_only_accepted: true
    });
    
    if (error1) {
      console.log('❌ Erro 1:', error1.message);
      console.log('📋 Detalhes completos:', error1);
    } else {
      console.log('✅ Sucesso 1:', data1?.length || 0, 'registros');
    }
    
    // Teste 3: Tentar chamar a função com parâmetros DATE
    console.log('\n📅 Teste 3: Chamar com parâmetros DATE');
    const { data: data2, error: error2 } = await supabase.rpc('get_project_carousel_data', {
      p_date_from: new Date('2024-01-01'),
      p_date_to: new Date('2024-12-31'),
      p_only_accepted: true
    });
    
    if (error2) {
      console.log('❌ Erro 2:', error2.message);
      console.log('📋 Detalhes completos:', error2);
    } else {
      console.log('✅ Sucesso 2:', data2?.length || 0, 'registros');
    }
    
    // Teste 4: Tentar chamar a função sem parâmetros
    console.log('\n🔍 Teste 4: Chamar sem parâmetros');
    const { data: data3, error: error3 } = await supabase.rpc('get_project_carousel_data');
    
    if (error3) {
      console.log('❌ Erro 3:', error3.message);
      console.log('📋 Detalhes completos:', error3);
    } else {
      console.log('✅ Sucesso 3:', data3?.length || 0, 'registros');
    }
    
    // Teste 5: Verificar se há dados na tabela hvac_estimates
    console.log('\n📊 Teste 5: Verificar dados na tabela hvac_estimates');
    const { data: estimates, error: estimatesError } = await supabase
      .from('hvac_estimates')
      .select('id, customer_name, txn_status, txn_date')
      .limit(5);
    
    if (estimatesError) {
      console.log('❌ Erro ao verificar estimates:', estimatesError.message);
    } else {
      console.log('✅ Estimates encontrados:', estimates?.length || 0, 'registros');
      if (estimates && estimates.length > 0) {
        console.log('📋 Primeiro estimate:', estimates[0]);
      }
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

debugCarouselFunction(); 