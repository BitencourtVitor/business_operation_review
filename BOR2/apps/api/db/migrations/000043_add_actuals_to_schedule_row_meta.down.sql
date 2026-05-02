ALTER TABLE construction_schedule_row_meta
  DROP COLUMN IF EXISTS is_finished,
  DROP COLUMN IF EXISTS real_finish,
  DROP COLUMN IF EXISTS real_start;
