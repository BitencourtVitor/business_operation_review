CREATE TYPE forecast_status AS ENUM ('planned', 'active', 'completed', 'cancelled');
CREATE TYPE company_name   AS ENUM ('hvac', 'framing', 'pcg');

CREATE TABLE forecast_projects (
  id             TEXT PRIMARY KEY,
  company        company_name    NOT NULL,
  name           TEXT            NOT NULL,
  status         forecast_status NOT NULL DEFAULT 'planned',
  start_date     DATE            NOT NULL,
  end_date       DATE            NOT NULL,
  contract_value NUMERIC(15,2)   NOT NULL DEFAULT 0,
  team           TEXT            NOT NULL DEFAULT '',
  qb_time        BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forecast_company ON forecast_projects(company);
CREATE INDEX idx_forecast_status  ON forecast_projects(status);
CREATE INDEX idx_forecast_dates   ON forecast_projects(start_date, end_date);
