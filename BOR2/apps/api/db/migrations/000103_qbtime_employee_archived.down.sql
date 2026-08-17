DROP INDEX IF EXISTS qbtime_employee_teams_company_archived_idx;

ALTER TABLE qbtime_employee_teams DROP COLUMN IF EXISTS archived_at;
ALTER TABLE qbtime_employee_teams DROP COLUMN IF EXISTS archived;
