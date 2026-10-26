-- As notas do contrato viram conversa: cada comentário com autor, cargo e hora.
-- O texto que já existia entra como primeiro comentário, assinado por quem
-- trouxe a planilha para o sistema, na data em que o contrato foi criado.
CREATE TABLE IF NOT EXISTS hvac_maintenance_comments (
  id          bigserial   PRIMARY KEY,
  contract_id uuid        NOT NULL REFERENCES hvac_maintenance_contracts (id) ON DELETE CASCADE,
  body        text        NOT NULL,
  author_id   text        NOT NULL DEFAULT '',
  author_name text        NOT NULL DEFAULT '',
  author_role text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_maintenance_comments_contract
  ON hvac_maintenance_comments (contract_id, created_at, id);

INSERT INTO hvac_maintenance_comments (contract_id, body, author_id, author_name, author_role, created_at)
SELECT id, notes, '9a66b74c-25d5-4697-ae11-e7e2e1dd9a00', 'Vitor Bitencourt', 'dev', created_at
FROM hvac_maintenance_contracts
WHERE btrim(notes) <> '';

ALTER TABLE hvac_maintenance_contracts DROP COLUMN IF EXISTS notes;
