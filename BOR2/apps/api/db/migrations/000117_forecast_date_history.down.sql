DROP TRIGGER IF EXISTS forecast_core_track_dates_insert_trg ON forecast_core;
DROP TRIGGER IF EXISTS forecast_core_track_dates_trg ON forecast_core;
DROP FUNCTION IF EXISTS forecast_core_track_dates_insert();
DROP FUNCTION IF EXISTS forecast_core_track_dates();
DROP TABLE IF EXISTS forecast_date_history;
