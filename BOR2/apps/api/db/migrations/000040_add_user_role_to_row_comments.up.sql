ALTER TABLE construction_schedule_row_comments
  ADD COLUMN IF NOT EXISTS user_role TEXT NOT NULL DEFAULT '';
