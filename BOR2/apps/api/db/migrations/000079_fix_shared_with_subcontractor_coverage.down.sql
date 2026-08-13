DELETE FROM catalog_forecast_fieldwire
WHERE client = '' AND type = '' AND document = 'Shared with subcontractor';

DELETE FROM forecast_fieldwire
WHERE document = 'Shared with subcontractor' AND category = '';
