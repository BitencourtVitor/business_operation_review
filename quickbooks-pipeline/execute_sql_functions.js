import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function executeSQLFunction() {
  try {
    console.log('🚀 Executando funções SQL no Supabase...');
    
    // Ler o arquivo SQL da função do ProjectChart
    const projectChartSQL = fs.readFileSync(
      path.join(process.cwd(), '..', 'frontend', 'backend', 'ProjectChart_datafunction.sql'),
      'utf8'
    );
    
    // Ler o arquivo SQL da função do ProjectCarousel
    const projectCarouselSQL = fs.readFileSync(
      path.join(process.cwd(), '..', 'frontend', 'backend', 'ProjectCarousel_data_function.sql'),
      'utf8'
    );
    
    console.log('📄 Função ProjectChart SQL carregada');
    console.log('📄 Função ProjectCarousel SQL carregada');
    
    // Executar a função SQL do ProjectChart
    const { data: chartData, error: chartError } = await supabase.rpc('get_project_chart_data', {
      p_selected_year: '2024',
      p_selected_month: null,
      p_selected_group: 'all'
    });
    
    if (chartError) {
      console.error('❌ Erro ao executar função ProjectChart SQL:', chartError);
      console.log('💡 Tentando criar a função ProjectChart primeiro...');
      
      // Tentar executar o SQL diretamente
      const { error: sqlError } = await supabase.rpc('exec_sql', {
        sql: projectChartSQL
      });
      
      if (sqlError) {
        console.error('❌ Erro ao criar função ProjectChart:', sqlError);
      } else {
        console.log('✅ Função ProjectChart criada com sucesso!');
      }
    } else {
      console.log('✅ Função ProjectChart executada com sucesso!');
      console.log('📊 Dados retornados:', chartData);
    }
    
         // Executar a função SQL do ProjectCarousel
     const { data: carouselData, error: carouselError } = await supabase.rpc('get_project_carousel_data_v2', {
      p_date_from: '2024-01-01',
      p_date_to: '2024-12-31',
      p_only_accepted: true
    });
    
    if (carouselError) {
      console.error('❌ Erro ao executar função ProjectCarousel SQL:', carouselError);
      console.log('💡 Tentando criar a função ProjectCarousel primeiro...');
      
      // Tentar executar o SQL diretamente
      const { error: sqlError } = await supabase.rpc('exec_sql', {
        sql: projectCarouselSQL
      });
      
      if (sqlError) {
        console.error('❌ Erro ao criar função ProjectCarousel:', sqlError);
      } else {
        console.log('✅ Função ProjectCarousel criada com sucesso!');
      }
    } else {
      console.log('✅ Função ProjectCarousel executada com sucesso!');
      console.log('📊 Dados retornados:', carouselData?.length || 0, 'registros');
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

executeSQLFunction(); 