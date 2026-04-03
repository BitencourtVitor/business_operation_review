import { supabase } from '../supabaseClient';

// Esquemas SQL para as tabelas de Fuel Control
const samsaraSchema = `
-- Schema para tabela Samsara (eventos unificados)
CREATE TABLE IF NOT EXISTS samsara_events (
    id BIGSERIAL PRIMARY KEY,
    event_key TEXT UNIQUE NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    nome TEXT NOT NULL,
    local TEXT,
    distancia DECIMAL(10,2) DEFAULT 0,
    units DECIMAL(10,3) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('idle', 'trip')),
    duration INTERVAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_samsara_events_event_key ON samsara_events(event_key);
CREATE INDEX IF NOT EXISTS idx_samsara_events_event_date ON samsara_events(event_date);
CREATE INDEX IF NOT EXISTS idx_samsara_events_nome ON samsara_events(nome);
CREATE INDEX IF NOT EXISTS idx_samsara_events_type ON samsara_events(type);
`;

const wexSchema = `
-- Schema para tabela WEX (transações de combustível)
CREATE TABLE IF NOT EXISTS wex_transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_key TEXT UNIQUE NOT NULL,
    transaction_date DATE NOT NULL,
    nome TEXT NOT NULL,
    units DECIMAL(10,3) NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    local TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_wex_transactions_transaction_key ON wex_transactions(transaction_key);
CREATE INDEX IF NOT EXISTS idx_wex_transactions_transaction_date ON wex_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_wex_transactions_nome ON wex_transactions(nome);
`;

const employeeNamesSchema = `
-- Tabela de normalização de nomes de funcionários
CREATE TABLE IF NOT EXISTS employee_names (
    id BIGSERIAL PRIMARY KEY,
    wex_name TEXT UNIQUE,
    samsara_name TEXT UNIQUE,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    vehicle_model TEXT NULL,
    vehicle_min_consumption BIGINT NULL,
    vehicle_max_consumption BIGINT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_employee_names_wex_name ON employee_names(wex_name);
CREATE INDEX IF NOT EXISTS idx_employee_names_samsara_name ON employee_names(samsara_name);
CREATE INDEX IF NOT EXISTS idx_employee_names_normalized_name ON employee_names(normalized_name);
`;

export const loadFuelControlSchema = async () => {
  try {
    // Verificar se as tabelas já existem usando uma abordagem compatível com Supabase
    const tablesToCheck = ['samsara_events', 'wex_transactions', 'employee_names'];
    const existingTables: string[] = [];

    for (const tableName of tablesToCheck) {
      try {
        const { error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (!error) {
          existingTables.push(tableName);
        }
      } catch (err) {
        // Tabela não existe, continuar
      }
    }

    if (existingTables.length >= 3) {
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
