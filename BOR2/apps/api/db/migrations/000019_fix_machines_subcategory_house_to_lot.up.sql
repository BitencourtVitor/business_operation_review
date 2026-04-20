-- Rename subcategory='House' to 'Lot' in catalog_forecast_machines
-- Consistent with forecast_core and fieldwire renaming
UPDATE catalog_forecast_machines SET subcategory = 'Lot' WHERE subcategory = 'House';
