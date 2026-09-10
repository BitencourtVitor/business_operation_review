DROP INDEX IF EXISTS atlas_sheet_inherited_idx;
ALTER TABLE atlas_sheet DROP COLUMN IF EXISTS inherited_from;
ALTER TABLE atlas_document_version
    DROP COLUMN IF EXISTS scope,
    DROP COLUMN IF EXISTS scope_pages;
