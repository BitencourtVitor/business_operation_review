-- Auditoria de ponta a ponta.
--
-- audit_logs guardava só quem, o quê e quando: user, action, resource,
-- resource_id. Não dizia qual rota foi chamada, o que foi enviado, nem se a
-- operação deu certo — então uma linha de auditoria não permitia reconstruir a
-- mudança, que é a razão de existir de uma auditoria.
--
-- As colunas abaixo completam o rastro. Todas nullable: as chamadas manuais que
-- já existem (auditService.Log) continuam válidas e passam a conviver com o
-- registro automático do middleware.
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS method       TEXT,
    ADD COLUMN IF NOT EXISTS path         TEXT,
    ADD COLUMN IF NOT EXISTS status_code  INTEGER,
    ADD COLUMN IF NOT EXISTS query        TEXT,
    -- Corpo da requisição, com campos sensíveis já redigidos pelo middleware.
    ADD COLUMN IF NOT EXISTS payload      JSONB,
    ADD COLUMN IF NOT EXISTS ip           TEXT,
    ADD COLUMN IF NOT EXISTS user_agent   TEXT,
    ADD COLUMN IF NOT EXISTS duration_ms  INTEGER,
    -- "manual" = chamada explícita de um handler; "middleware" = automático.
    -- Serve para saber o que já está coberto e o que ainda depende de alguém
    -- lembrar de chamar.
    ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'manual';

-- Consultar auditoria é sempre "o que aconteceu com este recurso" ou "o que
-- aconteceu neste período".
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx   ON audit_logs (resource, resource_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx       ON audit_logs (user_id, created_at DESC);
