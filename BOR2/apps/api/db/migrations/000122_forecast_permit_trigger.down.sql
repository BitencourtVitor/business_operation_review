DROP TRIGGER IF EXISTS forecast_core_seed_permit_trg ON forecast_core;
DROP FUNCTION IF EXISTS forecast_core_seed_permit();
ALTER TABLE forecast_permit DROP CONSTRAINT IF EXISTS forecast_permit_project_fk;
