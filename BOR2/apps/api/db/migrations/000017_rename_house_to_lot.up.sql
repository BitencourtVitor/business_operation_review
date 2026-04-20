-- "House" type no longer exists — renamed to "Lot"
UPDATE catalog_forecast_fieldwire SET type = 'Lot' WHERE type = 'House';
UPDATE forecast_fieldwire SET category = REPLACE(category, ' – House', ' – Lot') WHERE category LIKE '% – House';
