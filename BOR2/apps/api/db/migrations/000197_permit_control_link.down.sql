DROP TRIGGER IF EXISTS permit_control_sync_steps_trg ON permit_control;
DROP FUNCTION IF EXISTS permit_control_sync_steps();
ALTER TABLE permit_control DROP COLUMN IF EXISTS project_id;
