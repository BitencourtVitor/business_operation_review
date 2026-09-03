-- Traço de plano nasce privado.
--
-- Anotar é pensar em voz alta sobre o desenho: conferência de cota, dúvida,
-- lembrete de quem está lendo. Jogar isso na prancha de todo mundo por padrão
-- faria a folha encher de rabisco alheio e ninguém mais anotaria nada. Quem
-- quer que a equipe veja, marca antes de traçar.
ALTER TABLE atlas_annotation
  ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false;

-- A listagem filtra por autor e por este campo; o índice existente é por folha.
CREATE INDEX IF NOT EXISTS atlas_annotation_sheet_author_idx
  ON atlas_annotation (sheet_id, author_id) WHERE deleted_at IS NULL;
