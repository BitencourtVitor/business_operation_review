ALTER TABLE catalog_forecast_fieldwire
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';

UPDATE catalog_forecast_fieldwire
SET category = TRIM(client || CASE WHEN type <> '' THEN ' – ' || type ELSE '' END);

ALTER TABLE catalog_forecast_fieldwire DROP COLUMN IF EXISTS client;
ALTER TABLE catalog_forecast_fieldwire DROP COLUMN IF EXISTS type;
