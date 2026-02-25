-- Migration to add jobsite, lot_building, worktype and regular_hours to timesheet_analysis
-- This allows mapping backcharges to subcontractors via forecast_data

BEGIN;

ALTER TABLE public.timesheet_analysis 
ADD COLUMN IF NOT EXISTS jobsite TEXT,
ADD COLUMN IF NOT EXISTS lot_building TEXT,
ADD COLUMN IF NOT EXISTS worktype TEXT,
ADD COLUMN IF NOT EXISTS regular_hours NUMERIC;

COMMIT;
