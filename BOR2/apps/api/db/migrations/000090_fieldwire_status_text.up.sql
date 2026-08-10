DO $$
DECLARE
    col_type text;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'forecast_fieldwire' AND column_name = 'status';

    IF col_type = 'boolean' THEN
        ALTER TABLE forecast_fieldwire
            ALTER COLUMN status DROP DEFAULT,
            ALTER COLUMN status DROP NOT NULL,
            ALTER COLUMN status TYPE text USING CASE WHEN status::boolean THEN 'completed' ELSE NULL END,
            ALTER COLUMN status SET DEFAULT NULL;
    ELSE
        UPDATE forecast_fieldwire SET status = 'completed' WHERE lower(status) IN ('true', 't', '1', 'yes');
        UPDATE forecast_fieldwire SET status = NULL WHERE lower(COALESCE(status, '')) IN ('false', 'f', '0', 'no', '');
        ALTER TABLE forecast_fieldwire ALTER COLUMN status SET DEFAULT NULL;
    END IF;
END $$;
