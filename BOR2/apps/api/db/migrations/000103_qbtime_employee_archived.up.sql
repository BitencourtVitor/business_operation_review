-- Archived (terminated) employees, as QB Time reports them.
--
-- Until now the roster sync asked QB Time only for `active=yes`, so someone
-- archived after being let go simply stopped arriving and their row stayed
-- behind, indistinguishable from an active employee — and kept being counted
-- as absent every single day, on the Absences screen and in the daily e-mail.
--
-- The row is kept rather than deleted: the person's timesheet history is real
-- and every report that joins on qbt_user_id still needs the name.
ALTER TABLE qbtime_employee_teams
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

-- When the sync first saw them archived. QB Time's own term_date is unusable
-- here (it comes back as "0000-00-00" for everyone), so this is our own stamp,
-- not a claim about the actual termination date.
ALTER TABLE qbtime_employee_teams
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS qbtime_employee_teams_company_archived_idx
    ON qbtime_employee_teams (company, archived);
