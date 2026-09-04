-- A justificativa de uma troca pode vir com imagem.
--
-- `version_name` e `version_notes` dizem o que mudou em texto, e texto sozinho
-- não dá conta: o motivo de trocar uma prancha costuma ser uma foto do que foi
-- encontrado em obra, um recorte do e-mail do projetista, o print da marcação
-- que gerou a correção. Sem lugar para isso, a justificativa vira "ver anexo no
-- e-mail", e o anexo fica onde o Atlas não alcança.
--
-- Não nasce tabela nova: `atlas_media` já é onde arquivo de obra mora, com
-- chave no bucket, tipo, tamanho e quem subiu. Ela já pendura mídia em evento e
-- em diário pelo mesmo desenho, com a coluna nula quando não é o caso.
ALTER TABLE atlas_media
    -- O anexo pertence à revisão, e não à página: cada troca justifica a si
    -- mesma, e a linha de `atlas_sheet` é a própria revisão.
    ADD COLUMN IF NOT EXISTS sheet_id   TEXT REFERENCES atlas_sheet(id) ON DELETE CASCADE,
    -- O mesmo para a troca do set inteiro.
    ADD COLUMN IF NOT EXISTS version_id TEXT REFERENCES atlas_document_version(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS atlas_media_sheet_idx   ON atlas_media (sheet_id)   WHERE sheet_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_media_version_idx ON atlas_media (version_id) WHERE version_id IS NOT NULL;
