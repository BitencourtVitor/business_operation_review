DELETE FROM forecast_fieldwire WHERE document = 'On Atlas' AND category = '';
DELETE FROM catalog_forecast_fieldwire WHERE document = 'On Atlas' AND client = '' AND type = '';
ALTER TABLE catalog_forecast_fieldwire DROP COLUMN IF EXISTS counts_in_score;
