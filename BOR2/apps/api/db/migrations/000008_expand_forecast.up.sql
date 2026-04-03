-- Expand forecast_status enum with BOR1 values
ALTER TYPE forecast_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE forecast_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE forecast_status ADD VALUE IF NOT EXISTS 'overdue';
ALTER TYPE forecast_status ADD VALUE IF NOT EXISTS 'not_started';

-- Expand forecast_projects with BOR1 fields
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS cliente TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS job_site TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS lote_bld TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS obs TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS hvac BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS buildertrend BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS storage BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS machine_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS previous_beams_date DATE;
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS previous_start_date DATE;
ALTER TABLE forecast_projects ADD COLUMN IF NOT EXISTS previous_end_date DATE;

-- Forecast sub-tables
CREATE TABLE forecast_fieldwire (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     TEXT NOT NULL REFERENCES forecast_projects(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT '',
  document    TEXT NOT NULL DEFAULT '',
  status      BOOLEAN NOT NULL DEFAULT FALSE,
  lastupdate  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_forecast_fieldwire_obra ON forecast_fieldwire(obra_id);

CREATE TABLE forecast_machines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id            TEXT NOT NULL REFERENCES forecast_projects(id) ON DELETE CASCADE,
  category           TEXT NOT NULL DEFAULT '',
  subcategory        TEXT NOT NULL DEFAULT '',
  equipment_category TEXT NOT NULL DEFAULT '',
  title              TEXT NOT NULL DEFAULT '',
  status             BOOLEAN NOT NULL DEFAULT FALSE,
  unit               TEXT NOT NULL DEFAULT '',
  lastupdate         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_forecast_machines_obra ON forecast_machines(obra_id);

CREATE TABLE forecast_contract_steps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id    TEXT NOT NULL REFERENCES forecast_projects(id) ON DELETE CASCADE,
  step       TEXT NOT NULL DEFAULT '',
  status     BOOLEAN NOT NULL DEFAULT FALSE,
  team       TEXT NOT NULL DEFAULT '',
  lastupdate TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_forecast_contract_steps_obra ON forecast_contract_steps(obra_id);

-- Categorization reference tables
CREATE TABLE c_workforce (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE c_fieldwire (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category       TEXT NOT NULL DEFAULT '',
  document       TEXT NOT NULL DEFAULT '',
  where_location TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE c_machines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category           TEXT NOT NULL DEFAULT '',
  subcategory        TEXT NOT NULL DEFAULT '',
  equipment_category TEXT NOT NULL DEFAULT '',
  title              TEXT NOT NULL DEFAULT ''
);

CREATE TABLE c_contract_steps (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step TEXT NOT NULL
);

CREATE TABLE c_machine_provider (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- OFI scores
CREATE TABLE operational_forecast_index (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          TEXT NOT NULL,
  reference_month  INTEGER NOT NULL,
  reference_year   INTEGER NOT NULL,
  capture_date     DATE,
  fieldwire_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  machines_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
  contract_score   NUMERIC(5,2) NOT NULL DEFAULT 0,
  systems_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ofi_obra ON operational_forecast_index(obra_id);
CREATE INDEX idx_ofi_period ON operational_forecast_index(reference_year, reference_month);

-- Monthly execution history
CREATE TABLE monthly_execution_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             TEXT NOT NULL,
  reference_month     INTEGER NOT NULL,
  reference_year      INTEGER NOT NULL,
  planned_status      TEXT NOT NULL DEFAULT '',
  actual_status       TEXT NOT NULL DEFAULT '',
  reason              TEXT NOT NULL DEFAULT '',
  subcontractor       TEXT NOT NULL DEFAULT '',
  is_cycle_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_monthly_exec_obra ON monthly_execution_history(obra_id);
CREATE INDEX idx_monthly_exec_period ON monthly_execution_history(reference_year, reference_month);
