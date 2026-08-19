-- PCG Bids and Contracts sai do localStorage.
--
-- O módulo nasceu como protótipo ("local-only while the page is being designed")
-- e ficou em produção: em 19/08/2026 um contrato assinado com subcontratado
-- existia apenas no navegador de uma pessoa, sem cópia, sem log e sem backup.
-- Estas tabelas são o destino desse dado.
CREATE TABLE IF NOT EXISTS pcg_projects (
    id          TEXT PRIMARY KEY,
    name        TEXT        NOT NULL DEFAULT '',
    address     TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'active',
    type        TEXT        NOT NULL DEFAULT 'new_construction',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um trade dentro de um projeto: as respostas do questionário e as cláusulas
-- reescritas só para este contrato. trade_id é o id do catálogo ("electrical"),
-- que ainda vive no código.
CREATE TABLE IF NOT EXISTS pcg_project_trades (
    id                TEXT PRIMARY KEY,
    project_id        TEXT        NOT NULL REFERENCES pcg_projects(id) ON DELETE CASCADE,
    trade_id          TEXT        NOT NULL,
    answers           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    module_overrides  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    contract_number   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pcg_project_trades_unique UNIQUE (project_id, trade_id)
);

-- A linha do tempo: bid enviado, recebido, aprovado, contrato enviado, ajustado,
-- assinado. `params` guarda o papel congelado que gerou cada documento, e é o que
-- permite reproduzir exatamente o que o sub recebeu.
CREATE TABLE IF NOT EXISTS pcg_trade_events (
    id                TEXT PRIMARY KEY,
    project_trade_id  TEXT        NOT NULL REFERENCES pcg_project_trades(id) ON DELETE CASCADE,
    type              TEXT        NOT NULL,
    at                TIMESTAMPTZ NOT NULL,
    subcontractor     TEXT,
    amount            NUMERIC(14,2),
    lead_time_value   INTEGER,
    lead_time_unit    TEXT,
    note              TEXT,
    logged_by         TEXT,
    params            JSONB,
    payment_schedule  JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pcg_project_trades_project_idx ON pcg_project_trades (project_id);
CREATE INDEX IF NOT EXISTS pcg_trade_events_trade_idx     ON pcg_trade_events (project_trade_id, at);
