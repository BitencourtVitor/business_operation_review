-- Volta a folha a ser uma por página.
--
-- As revisões antigas são apagadas: o modelo antigo não tem onde guardá-las, e
-- deixá-las com a restrição de unicidade de volta impediria a própria migração.
DELETE FROM atlas_sheet WHERE superseded_at IS NOT NULL;

DROP INDEX IF EXISTS atlas_sheet_atual_uniq;
DROP INDEX IF EXISTS atlas_sheet_historia_idx;

ALTER TABLE atlas_sheet
    DROP COLUMN IF EXISTS revised_at,
    DROP COLUMN IF EXISTS revised_by,
    DROP COLUMN IF EXISTS superseded_at,
    DROP COLUMN IF EXISTS version_name,
    DROP COLUMN IF EXISTS version_notes;

ALTER TABLE atlas_sheet
    ADD CONSTRAINT atlas_sheet_unica UNIQUE (version_id, page_index);

ALTER TABLE atlas_document_version DROP COLUMN IF EXISTS name;
