import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function executeSQLFunctions() {
  try {
    console.log('🔄 Executando funções SQL...');
    
    // Ler o arquivo SQL
    const sqlContent = await fs.readFile('./ProjectChart_datafunction.sql', 'utf-8');
    
    // Executar o SQL
    const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      console.error('❌ Erro ao executar SQL:', error);
      return;
    }
    
    console.log('✅ Funções SQL executadas com sucesso!');
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

executeSQLFunctions(); 