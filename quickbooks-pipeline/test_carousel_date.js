import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function testCarouselFunctionWithDate() {
  try {
    console.log('🧪 Testando função do carrossel com parâmetros DATE...');
    
    // Teste com parâmetros DATE
    const { data, error } = await supabase.rpc('get_project_carousel_data', {
      p_date_from: new Date('2024-01-01'),
      p_date_to: new Date('2024-12-31'),
      p_only_accepted: true
    });
    
    if (error) {
      console.log('❌ Erro:', error.message);
      console.log('📋 Detalhes:', error);
    } else {
      console.log('✅ Sucesso:', data?.length || 0, 'registros');
      if (data && data.length > 0) {
        console.log('📊 Primeiro registro:', data[0]);
      }
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

testCarouselFunctionWithDate(); 