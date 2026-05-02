ALTER TABLE construction_schedule_row_comments
  ADD COLUMN IF NOT EXISTS created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL;
