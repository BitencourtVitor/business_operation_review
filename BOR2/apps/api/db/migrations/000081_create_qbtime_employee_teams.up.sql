CREATE TABLE qbtime_employee_teams (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company            TEXT        NOT NULL,
  qbt_user_id        INTEGER     NOT NULL,
  employee_name      TEXT        NOT NULL,
  qbt_team_id        INTEGER,
  qbt_team_name      TEXT,
  override_team_name TEXT,
  overridden_by      TEXT,
  overridden_at      TIMESTAMPTZ,
  last_synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qbtime_employee_teams_company_user_key UNIQUE (company, qbt_user_id)
);

CREATE INDEX qbtime_employee_teams_company_idx ON qbtime_employee_teams (company);
