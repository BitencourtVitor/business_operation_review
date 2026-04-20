UPDATE forecast_fieldwire
SET category = REPLACE(category, ' - Lot', ' - House')
WHERE category LIKE '% - Lot';
