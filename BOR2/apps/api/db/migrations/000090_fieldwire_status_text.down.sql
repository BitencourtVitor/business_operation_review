ALTER TABLE forecast_fieldwire
    ALTER COLUMN status DROP DEFAULT,
    ALTER COLUMN status TYPE boolean USING status IN ('completed', 'dispensed'),
    ALTER COLUMN status SET DEFAULT false,
    ALTER COLUMN status SET NOT NULL;
