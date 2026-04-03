-- Migration to simplify monthly_execution_history
-- This removes the score columns since only status and dates matter for this table

ALTER TABLE public.monthly_execution_history 
DROP COLUMN IF EXISTS planned_score,
DROP COLUMN IF EXISTS actual_fieldwire_score,
DROP COLUMN IF EXISTS actual_machines_score,
DROP COLUMN IF EXISTS actual_contract_score,
DROP COLUMN IF EXISTS actual_systems_score,
DROP COLUMN IF EXISTS actual_total_score,
ADD COLUMN IF NOT EXISTS reason TEXT;

-- Ensure constraints and indexes are still correct (they should be, as we didn't touch those columns)
COMMENT ON TABLE public.monthly_execution_history IS 'Stores the final status of projects that were planned in the OFI, focusing only on execution status and dates.';
