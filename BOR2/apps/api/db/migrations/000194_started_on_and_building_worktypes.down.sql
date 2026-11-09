ALTER TABLE wp_building_links DROP COLUMN IF EXISTS ignored_worktypes;
DROP TRIGGER IF EXISTS forecast_core_started_on ON forecast_core;
DROP FUNCTION IF EXISTS forecast_core_started_on();
ALTER TABLE forecast_core DROP COLUMN IF EXISTS started_on;
