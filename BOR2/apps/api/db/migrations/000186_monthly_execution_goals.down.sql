DROP TABLE IF EXISTS me_point_replies;
DROP TABLE IF EXISTS me_points;
DROP TABLE IF EXISTS me_goal_checkpoints;
DROP TABLE IF EXISTS me_goal_group_sites;
DROP TABLE IF EXISTS me_goal_groups;
DROP TRIGGER IF EXISTS forecast_core_finished_on ON forecast_core;
DROP FUNCTION IF EXISTS forecast_core_finished_on();
ALTER TABLE forecast_core DROP COLUMN IF EXISTS finished_on;
