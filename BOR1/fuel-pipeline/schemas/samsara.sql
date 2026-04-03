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

-- Comentários para documentação
COMMENT ON TABLE samsara_events IS 'Eventos unificados do Samsara (Idle Events + Trips)';
COMMENT ON COLUMN samsara_events.event_key IS 'Chave única: Idle Event Start Time + Asset: Name + Fuel Consumed OU Start Time + Asset: Name + Fuel Used';
COMMENT ON COLUMN samsara_events.nome IS 'Nome do responsável pelo evento';
COMMENT ON COLUMN samsara_events.local IS 'Endereço ou localização GPS';
COMMENT ON COLUMN samsara_events.distancia IS 'Distância percorrida (0 para idle, valor real para trips)';
COMMENT ON COLUMN samsara_events.units IS 'Combustível consumido em galões';
COMMENT ON COLUMN samsara_events.type IS 'Tipo do evento: idle ou trip';
COMMENT ON COLUMN samsara_events.duration IS 'Duração do evento idle (apenas para idle events)';
