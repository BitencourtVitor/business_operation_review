-- Fix rows where the old category used a regular hyphen ' - ' instead of em dash ' – '
-- These rows ended up with the full "Client - Type" string stored in the client column
UPDATE catalog_forecast_fieldwire
SET
  client = TRIM(split_part(client, ' - ', 1)),
  type   = TRIM(split_part(client, ' - ', 2))
WHERE client LIKE '% - %';
