DROP INDEX IF EXISTS atlas_annotation_sheet_author_idx;
ALTER TABLE atlas_annotation DROP COLUMN IF EXISTS shared;
