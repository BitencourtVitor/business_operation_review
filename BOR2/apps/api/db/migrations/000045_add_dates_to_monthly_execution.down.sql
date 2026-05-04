ALTER TABLE monthly_execution_history
  DROP COLUMN IF EXISTS actual_start_date,
  DROP COLUMN IF EXISTS actual_end_date;
