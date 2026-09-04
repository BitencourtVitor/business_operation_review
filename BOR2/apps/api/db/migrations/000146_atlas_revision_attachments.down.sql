-- Os anexos de justificativa somem com as colunas: sem elas não há como dizer
-- a que revisão pertenciam, e mídia órfã na obra é pior que mídia nenhuma.
DELETE FROM atlas_media WHERE sheet_id IS NOT NULL OR version_id IS NOT NULL;

DROP INDEX IF EXISTS atlas_media_sheet_idx;
DROP INDEX IF EXISTS atlas_media_version_idx;

ALTER TABLE atlas_media
    DROP COLUMN IF EXISTS sheet_id,
    DROP COLUMN IF EXISTS version_id;
