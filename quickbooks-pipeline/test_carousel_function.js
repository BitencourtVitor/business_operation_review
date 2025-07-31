import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function testCarouselFunction() {
  try {
    console.log('🧪 Testando função do carrossel...');
    
    // Teste 1: Com parâmetros TEXT
    console.log('\n📝 Teste 1: Parâmetros TEXT');
    const { data: data1, error: error1 } = await supabase.rpc('get_project_carousel_data', {
      p_date_from: '2024-01-01',
      p_date_to: '2024-12-31',
      p_only_accepted: true
    });
    
    if (error1) {
      console.log('❌ Erro 1:', error1.message);
    } else {
      console.log('✅ Sucesso 1:', data1?.length || 0, 'registros');
    }
    
    // Teste 2: Com parâmetros DATE
    console.log('\n📅 Teste 2: Parâmetros DATE');
    const { data: data2, error: error2 } = await supabase.rpc('get_project_carousel_data', {
      p_date_from: '2024-01-01',
      p_date_to: '2024-12-31',
      p_only_accepted: true
    });
    
    if (error2) {
      console.log('❌ Erro 2:', error2.message);
    } else {
      console.log('✅ Sucesso 2:', data2?.length || 0, 'registros');
    }
    
    // Teste 3: Sem parâmetros
    console.log('\n🔍 Teste 3: Sem parâmetros');
    const { data: data3, error: error3 } = await supabase.rpc('get_project_carousel_data');
    
    if (error3) {
      console.log('❌ Erro 3:', error3.message);
    } else {
      console.log('✅ Sucesso 3:', data3?.length || 0, 'registros');
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

testCarouselFunction(); 