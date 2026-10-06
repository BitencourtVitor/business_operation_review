-- As linhas tiradas das casas da Pulte não voltam aqui: o seed as repõe na
-- próxima edição da obra.
DELETE FROM catalog_forecast_builderlog WHERE client IN ('Private', 'Pulte Homes');
UPDATE catalog_forecast_builderlog SET client = '' WHERE client = 'Toll Brothers';
ALTER TABLE catalog_forecast_builderlog DROP CONSTRAINT IF EXISTS catalog_forecast_builderlog_client_build_type_document_key;
ALTER TABLE catalog_forecast_builderlog ADD CONSTRAINT catalog_forecast_builderlog_build_type_document_key
    UNIQUE (build_type, document);
ALTER TABLE catalog_forecast_builderlog DROP COLUMN IF EXISTS client;
