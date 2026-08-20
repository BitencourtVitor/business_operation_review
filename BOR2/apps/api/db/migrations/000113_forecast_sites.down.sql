DROP INDEX IF EXISTS idx_forecast_site_companies_company;
DROP INDEX IF EXISTS idx_forecast_core_site;
DROP INDEX IF EXISTS idx_forecast_sites_address;

ALTER TABLE forecast_core DROP COLUMN IF EXISTS site_id;

DROP TABLE IF EXISTS forecast_site_companies;
DROP TABLE IF EXISTS forecast_sites;

DROP FUNCTION IF EXISTS forecast_address_key(TEXT);
DROP FUNCTION IF EXISTS forecast_lot_key(TEXT);
