DELETE FROM catalog_forecast_fieldwire
WHERE client = 'Pulte Homes' AND type = 'Lot' AND document = 'Markup';

DELETE FROM forecast_fieldwire
WHERE document = 'Markup' AND category = 'Pulte Homes - House';
