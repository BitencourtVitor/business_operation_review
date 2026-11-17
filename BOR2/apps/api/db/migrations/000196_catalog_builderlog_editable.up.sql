-- O catálogo do BuilderLog passa a ser editado no Data Control no lugar do
-- Fieldwire (F-21). O editor genérico de catálogo grava e lê created_at, e o
-- seed só reconhece 'house' e 'building': o CHECK barra digitação fora disso.
ALTER TABLE catalog_forecast_builderlog
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE catalog_forecast_builderlog
    DROP CONSTRAINT IF EXISTS catalog_forecast_builderlog_build_type_chk;
ALTER TABLE catalog_forecast_builderlog
    ADD CONSTRAINT catalog_forecast_builderlog_build_type_chk CHECK (build_type IN ('house', 'building'));
