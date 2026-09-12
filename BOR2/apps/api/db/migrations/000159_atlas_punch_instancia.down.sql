DROP TRIGGER IF EXISTS atlas_punch_fecha_limpo_trg ON atlas_punch;
DROP FUNCTION IF EXISTS atlas_punch_fecha_limpo();
DROP INDEX IF EXISTS atlas_event_punch_idx;
ALTER TABLE atlas_event DROP COLUMN IF EXISTS punch_id;
DROP TABLE IF EXISTS atlas_punch;
