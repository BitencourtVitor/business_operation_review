DROP TABLE IF EXISTS forecast_builderlog;
DROP TABLE IF EXISTS catalog_forecast_builderlog;

-- O "On Atlas" volta ao catálogo do Fieldwire, fora da nota, como na 000169.
INSERT INTO catalog_forecast_fieldwire (id, client, type, document, where_location, notes, created_at, counts_in_score)
SELECT COALESCE(MAX(id), 0) + 1, '', '', 'On Atlas', 'Atlas', 'Não conta no OFI.', NOW(), false
  FROM catalog_forecast_fieldwire
 WHERE NOT EXISTS (SELECT 1 FROM catalog_forecast_fieldwire WHERE document = 'On Atlas');
