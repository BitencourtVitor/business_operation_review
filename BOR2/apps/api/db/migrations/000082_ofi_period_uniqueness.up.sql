CREATE UNIQUE INDEX IF NOT EXISTS ux_ofi_obra_reference_period
    ON operational_forecast_index (obra_id, reference_year, reference_month);

CREATE UNIQUE INDEX IF NOT EXISTS ux_monthly_execution_obra_reference_period
    ON monthly_execution_history (obra_id, reference_year, reference_month);
