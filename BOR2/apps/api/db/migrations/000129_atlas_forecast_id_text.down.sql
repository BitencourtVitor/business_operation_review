ALTER TABLE atlas_jobsite
    ALTER COLUMN forecast_id TYPE BIGINT USING NULLIF(regexp_replace(forecast_id, '\D', '', 'g'), '')::bigint;
