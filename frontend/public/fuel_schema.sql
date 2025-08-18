-- Schema para tabelas de combustível (Samsara, WEX e normalização)
-- Este arquivo é carregado automaticamente ao abrir o projeto

-- Tabela Samsara (eventos unificados)
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

-- Comentários para documentação
COMMENT ON TABLE samsara_events IS 'Eventos unificados do Samsara (Idle Events + Trips)';
COMMENT ON COLUMN samsara_events.event_key IS 'Chave única: Idle Event Start Time + Asset: Name + Fuel Consumed OU Start Time + Asset: Name + Fuel Used';
COMMENT ON COLUMN samsara_events.nome IS 'Nome do responsável pelo evento';
COMMENT ON COLUMN samsara_events.local IS 'Endereço ou localização GPS';
COMMENT ON COLUMN samsara_events.distancia IS 'Distância percorrida (0 para idle, valor real para trips)';
COMMENT ON COLUMN samsara_events.units IS 'Combustível consumido em galões';
COMMENT ON COLUMN samsara_events.type IS 'Tipo do evento: idle ou trip';
COMMENT ON COLUMN samsara_events.duration IS 'Duração do evento idle (apenas para idle events)';

-- Tabela WEX (transações de combustível)
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

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_wex_transactions_transaction_key ON wex_transactions(transaction_key);
CREATE INDEX IF NOT EXISTS idx_wex_transactions_transaction_date ON wex_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_wex_transactions_nome ON wex_transactions(nome);

-- Comentários para documentação
COMMENT ON TABLE wex_transactions IS 'Transações de combustível do sistema WEX (simplificada)';
COMMENT ON COLUMN wex_transactions.transaction_key IS 'Chave única: Transaction Date + Transaction Time + Emboss Line 2 + Units';
COMMENT ON COLUMN wex_transactions.nome IS 'Nome do responsável pelo abastecimento';
COMMENT ON COLUMN wex_transactions.units IS 'Quantidade de combustível em galões';
COMMENT ON COLUMN wex_transactions.valor IS 'Valor total do abastecimento';
COMMENT ON COLUMN wex_transactions.local IS 'Cidade onde aconteceu o abastecimento';

-- Tabela de normalização de nomes de funcionários
CREATE TABLE IF NOT EXISTS employee_names (
    id BIGSERIAL PRIMARY KEY,
    wex_name TEXT UNIQUE,
    samsara_name TEXT UNIQUE,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_employee_names_wex_name ON employee_names(wex_name);
CREATE INDEX IF NOT EXISTS idx_employee_names_samsara_name ON employee_names(samsara_name);
CREATE INDEX IF NOT EXISTS idx_employee_names_normalized_name ON employee_names(normalized_name);

-- Comentários para documentação
COMMENT ON TABLE employee_names IS 'Tabela de normalização de nomes entre WEX e Samsara';
COMMENT ON COLUMN employee_names.wex_name IS 'Nome como aparece nas transações WEX';
COMMENT ON COLUMN employee_names.samsara_name IS 'Nome como aparece nos eventos Samsara';
COMMENT ON COLUMN employee_names.normalized_name IS 'Nome padronizado para uso interno';

-- Dados iniciais baseados na análise
INSERT INTO employee_names (wex_name, samsara_name, normalized_name) VALUES
    ('JOSE HONORIO', 'Jose Honorio', 'Jose Honorio'),
    ('RODRIGO ROMAO', 'Rodrigo Romao', 'Rodrigo Romao'),
    ('KEVIN SANTOS', 'Kevin', 'Kevin Santos'),
    ('JUAN MENDEZ', 'Juan', 'Juan Mendez'),
    ('EWERTON OLIVEIRA', 'Ewerton', 'Ewerton Oliveira'),
    ('LEANDRO NASCIMENTO', 'Leandro Alves', 'Leandro Nascimento'),
    ('JOSE HELIO VIANA', NULL, 'Jose Helio Viana'),
    ('JOSE QUINO', NULL, 'Jose Quino'),
    ('JOSIMAR D SANTOS', NULL, 'Josimar D Santos'),
    ('ANDRE DA SILVA', NULL, 'Andre Da Silva'),
    ('CLAYTON DE SOUZA', NULL, 'Clayton De Souza'),
    ('EDWIN GONZALEZ', NULL, 'Edwin Gonzalez'),
    ('GILLIANO BORGES', NULL, 'Gilliano Borges'),
    ('GILMAR MACEDO', NULL, 'Gilmar Macedo'),
    ('GUILHERME COSTA', NULL, 'Guilherme Costa'),
    ('JONAS DA SILVA', NULL, 'Jonas Da Silva'),
    ('LEANDRO DA SILVA', NULL, 'Leandro Da Silva'),
    ('LEVI GUSTAVO NASC', NULL, 'Levi Gustavo Nascimento'),
    ('RODRIGO MACEDO', NULL, 'Rodrigo Macedo'),
    ('SIRLEI SANTOS', NULL, 'Sirlei Santos'),
    ('WARLEY OLIVEIRA', NULL, 'Warley Oliveira'),
    ('WIRLLA LEITE', NULL, 'Wirlla Leite'),
    ('Jimmy', NULL, 'Jimmy'),
    ('Pacifico', NULL, 'Pacifico'),
    ('Solon', NULL, 'Solon')
ON CONFLICT (wex_name) DO UPDATE SET
    samsara_name = EXCLUDED.samsara_name,
    normalized_name = EXCLUDED.normalized_name,
    updated_at = NOW();

-- Inserir nomes apenas do Samsara (que não têm correspondência no WEX)
INSERT INTO employee_names (wex_name, samsara_name, normalized_name) VALUES
    (NULL, 'Jimmy', 'Jimmy'),
    (NULL, 'Pacifico', 'Pacifico'),
    (NULL, 'Solon', 'Solon')
ON CONFLICT (samsara_name) DO NOTHING;
