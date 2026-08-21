DROP TRIGGER IF EXISTS forecast_core_hvac_dates_trg ON forecast_core;

ALTER TABLE forecast_core
    DROP COLUMN IF EXISTS hvac_rough_end_date,
    DROP COLUMN IF EXISTS hvac_air_handler_end_date,
    DROP COLUMN IF EXISTS hvac_condenser_end_date,
    DROP COLUMN IF EXISTS hvac_finish_end_date;

DROP FUNCTION IF EXISTS forecast_tracked_date_fields();
