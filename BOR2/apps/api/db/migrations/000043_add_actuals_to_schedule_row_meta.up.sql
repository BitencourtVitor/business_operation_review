-- Add real (actual) execution dates and finished flag to the per-row metadata table.
ALTER TABLE construction_schedule_row_meta
  ADD COLUMN IF NOT EXISTS real_start  DATE,
  ADD COLUMN IF NOT EXISTS real_finish DATE,
  ADD COLUMN IF NOT EXISTS is_finished BOOLEAN NOT NULL DEFAULT FALSE;
