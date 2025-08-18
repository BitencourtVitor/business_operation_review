import { supabase } from '../supabaseClient';

export const loadFuelControlSchema = async () => {
  try {
    console.log('Carregando esquema de Fuel Control...');
    
    // Verificar se as tabelas já existem tentando fazer uma consulta simples
    try {
      await supabase.from('samsara_events').select('id').limit(1);
      await supabase.from('wex_transactions').select('id').limit(1);
      await supabase.from('employee_names').select('id').limit(1);
      
      console.log('Tabelas de Fuel Control já existem');
      return true;
    } catch {
      // Tabelas não existem, continuar com a criação
    }

    // Carregar e executar o esquema SQL
    const response = await fetch('/fuel_schema.sql');
    if (!response.ok) {
      throw new Error(`Erro ao carregar esquema: ${response.statusText}`);
    }

    const schemaSQL = await response.text();
    
    // Executar o esquema em partes para evitar problemas com múltiplas declarações
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
          if (error) {
            console.warn('Aviso ao executar statement:', statement, error);
          }
        } catch (rpcError) {
          console.warn('Erro RPC ao executar statement:', statement, rpcError);
        }
      }
    }

    console.log('Esquema de Fuel Control carregado com sucesso');
    return true;
    
  } catch (error) {
    console.error('Erro ao carregar esquema de Fuel Control:', error);
    return false;
  }
};

export const checkFuelDataAvailability = async () => {
  try {
    const { count: samsaraCount } = await supabase
      .from('samsara_events')
      .select('*', { count: 'exact', head: true });

    const { count: wexCount } = await supabase
      .from('wex_transactions')
      .select('*', { count: 'exact', head: true });

    const { count: employeeCount } = await supabase
      .from('employee_names')
      .select('*', { count: 'exact', head: true });

    return {
      samsaraEvents: samsaraCount || 0,
      wexTransactions: wexCount || 0,
      employeeNames: employeeCount || 0,
      hasData: (samsaraCount || 0) > 0 || (wexCount || 0) > 0
    };
  } catch (error) {
    console.error('Erro ao verificar disponibilidade de dados:', error);
    return {
      samsaraEvents: 0,
      wexTransactions: 0,
      employeeNames: 0,
      hasData: false
    };
  }
};
