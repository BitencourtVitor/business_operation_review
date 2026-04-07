ALTER TABLE destaques      ADD COLUMN IF NOT EXISTS updated_by_id TEXT REFERENCES users(id);
ALTER TABLE oportunidades  ADD COLUMN IF NOT EXISTS updated_by_id TEXT REFERENCES users(id);
ALTER TABLE planos_de_acao ADD COLUMN IF NOT EXISTS updated_by_id TEXT REFERENCES users(id);

UPDATE destaques      SET updated_by_id = usuario_id WHERE updated_by_id IS NULL;
UPDATE oportunidades  SET updated_by_id = usuario_id WHERE updated_by_id IS NULL;
UPDATE planos_de_acao SET updated_by_id = usuario_id WHERE updated_by_id IS NULL;
