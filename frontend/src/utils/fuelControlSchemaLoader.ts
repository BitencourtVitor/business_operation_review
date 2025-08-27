import { supabase } from '../supabaseClient';

export const loadFuelControlSchema = async () => {
  try {
    // Verificar se as tabelas já existem
    const { data: existingTables, error: listError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['samsara_events', 'wex_transactions', 'employee_names']);

    if (listError) {
      throw listError;
    }

    if (existingTables && existingTables.length >= 3) {
      // Log quando as tabelas já existem
      const existingSummary = {
        message: 'Tabelas de Fuel Control já existem',
        existingTables: existingTables.map(t => t.table_name)
      };
      return { success: true, message: 'Esquema já existe' };
    }

    // Carregar esquemas das tabelas
    const schemas = [
      { name: 'samsara.sql', content: samsaraSchema },
      { name: 'wex.sql', content: wexSchema },
      { name: 'employee_names.sql', content: employeeNamesSchema }
    ];

    for (const schema of schemas) {
      const { error } = await supabase.rpc('exec_sql', { sql: schema.content });
      if (error) {
        throw new Error(`Erro ao executar ${schema.name}: ${error.message}`);
      }
    }

    // Log de sucesso
    const successSummary = {
      message: 'Esquema de Fuel Control carregado com sucesso',
      tablesCreated: schemas.length
    };

    return { success: true, message: 'Esquema carregado com sucesso' };
  } catch (error) {
    console.error('Erro ao carregar esquema:', error);
    throw error;
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
