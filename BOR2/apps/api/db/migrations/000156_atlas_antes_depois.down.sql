DROP TRIGGER IF EXISTS atlas_exige_depois_trg ON atlas_event;
DROP FUNCTION IF EXISTS atlas_exige_depois();
ALTER TABLE atlas_media DROP COLUMN IF EXISTS phase;
