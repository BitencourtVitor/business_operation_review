-- Convert forecast_machines.status from boolean to text enum
-- If already text, normalize values. If boolean, convert.
-- Values: NULL = absent, 'scheduled' = active, 'dispensed' = dispensed

DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'forecast_machines' AND column_name = 'status';

  IF col_type = 'boolean' THEN
    ALTER TABLE forecast_machines
      ALTER COLUMN status DROP DEFAULT,
      ALTER COLUMN status TYPE TEXT USING CASE WHEN status::boolean THEN 'scheduled' ELSE NULL END,
      ALTER COLUMN status SET DEFAULT NULL;
  ELSE
    -- Already text: normalize 'true'/'false' leftovers
    UPDATE forecast_machines SET status = 'scheduled' WHERE status IN ('true', '1', 'yes');
    UPDATE forecast_machines SET status = NULL        WHERE status IN ('false', '0', 'no', '');
    ALTER TABLE forecast_machines ALTER COLUMN status SET DEFAULT NULL;
  END IF;
END $$;
