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
    
    console.log('📄 Função ProjectChart SQL carregada');
    
    // Executar a função SQL
    const { data, error } = await supabase.rpc('get_project_chart_data', {
      p_selected_year: '2024',
      p_selected_month: null,
      p_selected_group: 'all'
    });
    
    if (error) {
      console.error('❌ Erro ao executar função SQL:', error);
      console.log('💡 Tentando criar a função primeiro...');
      
      // Tentar executar o SQL diretamente
      const { error: sqlError } = await supabase.rpc('exec_sql', {
        sql: projectChartSQL
      });
      
      if (sqlError) {
        console.error('❌ Erro ao criar função:', sqlError);
      } else {
        console.log('✅ Função criada com sucesso!');
      }
    } else {
      console.log('✅ Função executada com sucesso!');
      console.log('📊 Dados retornados:', data);
    }
    
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
}

executeSQLFunction(); 