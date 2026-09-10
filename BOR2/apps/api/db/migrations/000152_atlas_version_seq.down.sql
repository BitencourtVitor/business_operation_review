DROP TRIGGER IF EXISTS atlas_version_seq_trg ON atlas_document_version;
DROP FUNCTION IF EXISTS atlas_version_seq();
DROP INDEX IF EXISTS atlas_document_version_seq_idx;
ALTER TABLE atlas_document_version DROP COLUMN IF EXISTS seq;
