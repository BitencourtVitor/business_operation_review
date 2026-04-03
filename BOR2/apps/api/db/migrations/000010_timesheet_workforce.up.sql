-- Timesheet analysis (from Google Sheets sync)
CREATE TABLE timesheet_analysis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE,
  nome            TEXT NOT NULL DEFAULT '',
  error           TEXT NOT NULL DEFAULT '',
  team            TEXT NOT NULL DEFAULT '',
  corporation     TEXT NOT NULL DEFAULT '',
  payrate         NUMERIC(10,2) NOT NULL DEFAULT 0,
  add_time_hour   NUMERIC(10,2) NOT NULL DEFAULT 0,
  remove_time_hour NUMERIC(10,2) NOT NULL DEFAULT 0,
  add_dollar      NUMERIC(10,2) NOT NULL DEFAULT 0,
  remove_dollar   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  jobsite         TEXT NOT NULL DEFAULT '',
  lot_building    TEXT NOT NULL DEFAULT '',
  worktype        TEXT NOT NULL DEFAULT '',
  regular_hours   NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_timesheet_date ON timesheet_analysis(date);
CREATE INDEX idx_timesheet_nome ON timesheet_analysis(nome);
CREATE INDEX idx_timesheet_team ON timesheet_analysis(team);

-- Timesheet raw data from QBTime
CREATE TABLE timesheet_data_new (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client          TEXT NOT NULL DEFAULT '',
  jobsite         TEXT NOT NULL DEFAULT '',
  lot_building    TEXT NOT NULL DEFAULT '',
  worktype        TEXT NOT NULL DEFAULT '',
  employee_name   TEXT NOT NULL DEFAULT '',
  regular_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
  regular_hours   NUMERIC(10,2) NOT NULL DEFAULT 0,
  reference_month TEXT NOT NULL DEFAULT '',
  company         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_timesheet_new_month ON timesheet_data_new(reference_month);
CREATE INDEX idx_timesheet_new_company ON timesheet_data_new(company);
CREATE INDEX idx_timesheet_new_employee ON timesheet_data_new(employee_name);

-- Workforce projects
CREATE TABLE workforce_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client      TEXT NOT NULL DEFAULT '',
  job_site    TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT '',
  workforce   TEXT NOT NULL DEFAULT '',
  hvac        BOOLEAN NOT NULL DEFAULT FALSE,
  status      TEXT NOT NULL DEFAULT '',
  start_date  DATE,
  end_date    DATE,
  fieldwire   BOOLEAN NOT NULL DEFAULT FALSE,
  contrato    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workforce_projects_status ON workforce_projects(status);

-- Workforce groups
CREATE TABLE workforce_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo         TEXT NOT NULL DEFAULT '',
  categoria     TEXT NOT NULL DEFAULT '',
  especialidade TEXT NOT NULL DEFAULT '',
  capacidade    TEXT NOT NULL DEFAULT '',
  contato       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subcontractor events (BOR1's event-based tracking)
CREATE TABLE subcontractor_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             TEXT NOT NULL DEFAULT '',
  event               TEXT NOT NULL DEFAULT '',
  estimated_date_type TEXT NOT NULL DEFAULT '',
  subcontractor       TEXT NOT NULL DEFAULT '',
  event_datetime      TIMESTAMPTZ,
  user_email          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (obra_id, event, event_datetime)
);
CREATE INDEX idx_sub_events_obra ON subcontractor_events(obra_id);
CREATE INDEX idx_sub_events_subcontractor ON subcontractor_events(subcontractor);
