DROP TRIGGER IF EXISTS atlas_point_number_trg ON atlas_event;
DROP FUNCTION IF EXISTS atlas_point_number();
DROP INDEX IF EXISTS atlas_event_point_number_idx;
ALTER TABLE atlas_event DROP COLUMN IF EXISTS point_number;
ALTER TABLE atlas_sync_event DROP COLUMN IF EXISTS occurred_offset_minutes;
