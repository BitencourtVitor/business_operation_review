DROP INDEX IF EXISTS atlas_sheet_fingerprint;
ALTER TABLE atlas_sheet
    DROP COLUMN IF EXISTS text_hash,
    DROP COLUMN IF EXISTS geom_hash;
