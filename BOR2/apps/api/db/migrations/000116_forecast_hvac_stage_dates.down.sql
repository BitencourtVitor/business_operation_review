DROP TRIGGER IF EXISTS forecast_core_hvac_dates_trg ON forecast_core;
DROP FUNCTION IF EXISTS forecast_core_hvac_dates();

ALTER TABLE forecast_core
    DROP COLUMN IF EXISTS hvac_rough_date,
    DROP COLUMN IF EXISTS hvac_air_handler_date,
    DROP COLUMN IF EXISTS hvac_condenser_date,
    DROP COLUMN IF EXISTS hvac_finish_date;
