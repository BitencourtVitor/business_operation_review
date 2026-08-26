DROP TRIGGER IF EXISTS forecast_fieldwire_sem_hvac ON forecast_fieldwire;
DROP TRIGGER IF EXISTS forecast_machines_sem_hvac ON forecast_machines;
DROP TRIGGER IF EXISTS forecast_contract_steps_sem_hvac ON forecast_contract_steps;
DROP TRIGGER IF EXISTS forecast_permit_so_hvac ON forecast_permit;
DROP FUNCTION IF EXISTS forecast_bloqueia_estrutura_framing();
DROP FUNCTION IF EXISTS forecast_bloqueia_permit_framing();
