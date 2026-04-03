-- Permit control
CREATE TABLE permit_control (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model       TEXT NOT NULL DEFAULT '',
  jobsite     TEXT NOT NULL DEFAULT '',
  lot_address TEXT NOT NULL DEFAULT '',
  situacao    TEXT NOT NULL DEFAULT '',
  solicitacao DATE,
  aplicacao   DATE,
  emissao     DATE,
  observacao  TEXT NOT NULL DEFAULT '',
  arquivo     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_permit_jobsite ON permit_control(jobsite);

-- Service requests
CREATE TABLE service_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor               TEXT NOT NULL DEFAULT '',
  job_site                 TEXT NOT NULL DEFAULT '',
  city                     TEXT NOT NULL DEFAULT '',
  lot                      TEXT NOT NULL DEFAULT '',
  address                  TEXT NOT NULL DEFAULT '',
  close_date               DATE,
  date_received            DATE,
  material_available_date  DATE,
  resident_available_date  DATE,
  date_completed           DATE,
  additional_visits        TEXT[] DEFAULT '{}',
  issue                    TEXT NOT NULL DEFAULT '',
  warranty                 BOOLEAN NOT NULL DEFAULT FALSE,
  tech                     TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_service_contractor ON service_requests(contractor);
CREATE INDEX idx_service_date ON service_requests(date_received);

-- Takeoff works (framing engineering)
CREATE TABLE takeoff_works (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project                  TEXT NOT NULL DEFAULT '',
  data_solicitacao         DATE,
  data_inicio              DATE,
  data_estimada_entrega    DATE,
  entrega_real             DATE,
  description              TEXT NOT NULL DEFAULT '',
  doc_links                TEXT NOT NULL DEFAULT '',
  modelo_da_casa           TEXT NOT NULL DEFAULT '',
  stage_dwg                TEXT NOT NULL DEFAULT '',
  stage_mitek3d            TEXT NOT NULL DEFAULT '',
  stage_materials_list     TEXT NOT NULL DEFAULT '',
  stage_panel_division     TEXT NOT NULL DEFAULT '',
  stage_validation         TEXT NOT NULL DEFAULT '',
  stage_cut_list           TEXT NOT NULL DEFAULT '',
  stage_production         TEXT NOT NULL DEFAULT '',
  stage_delivery           TEXT NOT NULL DEFAULT '',
  stage_assembly           TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_takeoff_project ON takeoff_works(project);

CREATE TABLE takeoff_works_responsibles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  takeoff_id UUID NOT NULL REFERENCES takeoff_works(id) ON DELETE CASCADE,
  step       TEXT NOT NULL DEFAULT '',
  responsible TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_takeoff_resp_takeoff ON takeoff_works_responsibles(takeoff_id);

-- Project monitoring HVAC (S1-S4 stages)
CREATE TABLE project_monitoring_hvac (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city              TEXT NOT NULL DEFAULT '',
  job_site          TEXT NOT NULL DEFAULT '',
  lot_number        TEXT NOT NULL DEFAULT '',
  team              TEXT NOT NULL DEFAULT '',
  start_date        DATE,
  finish_date       DATE,
  s1_rough          TEXT NOT NULL DEFAULT '',
  s1_date           DATE,
  s2_machines       TEXT NOT NULL DEFAULT '',
  s2_date           DATE,
  s3_condenser      TEXT NOT NULL DEFAULT '',
  s3_date           DATE,
  s4_finish         TEXT NOT NULL DEFAULT '',
  s4_date           DATE,
  percent_completed NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_update       TIMESTAMPTZ,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_monitoring_jobsite ON project_monitoring_hvac(job_site);
CREATE INDEX idx_monitoring_team ON project_monitoring_hvac(team);

-- Employee names normalization (fuel cross-reference)
CREATE TABLE employee_names (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wex_name                 TEXT NOT NULL DEFAULT '',
  samsara_name             TEXT NOT NULL DEFAULT '',
  normalized_name          TEXT NOT NULL DEFAULT '',
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  vehicle_model            TEXT NOT NULL DEFAULT '',
  vehicle_min_consumption  NUMERIC(5,2) NOT NULL DEFAULT 0,
  vehicle_max_consumption  NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_employee_names_normalized ON employee_names(normalized_name);
CREATE INDEX idx_employee_names_active ON employee_names(is_active);
