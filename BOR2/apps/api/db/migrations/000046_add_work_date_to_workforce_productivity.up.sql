ALTER TABLE workforce_productivity ADD COLUMN IF NOT EXISTS work_date DATE NULL;
CREATE INDEX IF NOT EXISTS idx_workforce_productivity_work_date ON workforce_productivity (work_date);
