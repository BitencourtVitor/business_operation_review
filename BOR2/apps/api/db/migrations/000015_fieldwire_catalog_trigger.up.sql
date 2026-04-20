-- Replace free-form category with structured (client, type) trigger fields
-- in catalog_forecast_fieldwire, so that when a new project is created
-- with matching (cliente, type) its fieldwire docs are auto-seeded.

ALTER TABLE catalog_forecast_fieldwire
  ADD COLUMN IF NOT EXISTS client TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS type   TEXT NOT NULL DEFAULT '';

-- Map existing data: split "Client – Type" pattern (em dash separator)
UPDATE catalog_forecast_fieldwire
SET
  client = TRIM(split_part(category, ' – ', 1)),
  type   = TRIM(split_part(category, ' – ', 2))
WHERE category LIKE '% – %';

-- For rows that don't follow the pattern, use full category as client
UPDATE catalog_forecast_fieldwire
SET client = TRIM(category)
WHERE category NOT LIKE '% – %' AND category <> '';

ALTER TABLE catalog_forecast_fieldwire DROP COLUMN IF EXISTS category;
