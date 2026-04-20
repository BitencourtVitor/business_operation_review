UPDATE catalog_forecast_fieldwire SET type = 'House' WHERE type = 'Lot';
UPDATE forecast_fieldwire SET category = REPLACE(category, ' – Lot', ' – House') WHERE category LIKE '% – Lot';
