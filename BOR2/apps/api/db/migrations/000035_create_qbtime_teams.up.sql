CREATE TABLE qbtime_teams (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  company    TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  members    TEXT[]  NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qbtime_teams_company_name_key UNIQUE (company, name)
);

CREATE INDEX qbtime_teams_company_idx ON qbtime_teams (company);
