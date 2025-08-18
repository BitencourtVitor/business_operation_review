-- Script para criar a tabela samsara_events
-- Esta tabela armazena eventos do Samsara (Idle Events e Trips)

CREATE TABLE IF NOT EXISTS samsara_events (
    id BIGSERIAL PRIMARY KEY,
    
    -- Campos principais conforme especificação
    event_date TIMESTAMP WITH TIME ZONE, -- Data e hora do evento
    nome VARCHAR(255) NOT NULL, -- Nome do responsável
    local TEXT, -- Endereço/local onde aconteceu
    distancia DECIMAL(10,2) DEFAULT 0, -- Distância percorrida (0 para idle events)
    units DECIMAL(10,3) DEFAULT 0, -- Combustível gasto em galões
    type VARCHAR(10) NOT NULL CHECK (type IN ('idle', 'trip')), -- Tipo do evento
    
    -- Chave composta para identificar unicamente o evento
    event_key VARCHAR(500) UNIQUE NOT NULL,
    
    -- Campos adicionais para referência e análise
    idle_duration DECIMAL(8,4) DEFAULT 0, -- Duração do idle em horas (apenas para idle events)
    raw_start_time TEXT, -- Valor original da data/hora para debug
    raw_asset_name TEXT, -- Valor original do nome do asset para debug
    
    -- Campos de auditoria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_samsara_events_event_date ON samsara_events(event_date);
CREATE INDEX IF NOT EXISTS idx_samsara_events_nome ON samsara_events(nome);
CREATE INDEX IF NOT EXISTS idx_samsara_events_type ON samsara_events(type);
CREATE INDEX IF NOT EXISTS idx_samsara_events_event_key ON samsara_events(event_key);

-- Comentários para documentar a tabela
COMMENT ON TABLE samsara_events IS 'Tabela para armazenar eventos do Samsara (Idle Events e Trips)';
COMMENT ON COLUMN samsara_events.event_date IS 'Data e hora do evento';
COMMENT ON COLUMN samsara_events.nome IS 'Nome do responsável pelo evento';
COMMENT ON COLUMN samsara_events.local IS 'Endereço/local onde o evento aconteceu';
COMMENT ON COLUMN samsara_events.distancia IS 'Distância percorrida em milhas (0 para idle events)';
COMMENT ON COLUMN samsara_events.units IS 'Combustível consumido em galões';
COMMENT ON COLUMN samsara_events.type IS 'Tipo do evento: idle ou trip';
COMMENT ON COLUMN samsara_events.event_key IS 'Chave única composta por data/hora + nome do responsável';
COMMENT ON COLUMN samsara_events.idle_duration IS 'Duração do idle em horas (apenas para idle events)';
COMMENT ON COLUMN samsara_events.raw_start_time IS 'Valor original da data/hora para referência';
COMMENT ON COLUMN samsara_events.raw_asset_name IS 'Valor original do nome do asset para referência';
