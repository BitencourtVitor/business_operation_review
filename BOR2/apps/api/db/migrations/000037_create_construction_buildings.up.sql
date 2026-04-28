-- Buildings being tracked in the construction schedule system
CREATE TABLE construction_buildings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  address    TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One schedule per building (current + archived history)
CREATE TABLE construction_schedules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id    UUID        NOT NULL REFERENCES construction_buildings(id) ON DELETE CASCADE,
  pdf_filename   TEXT        NOT NULL DEFAULT '',
  project_start  DATE,
  project_finish DATE,
  schedule_data  JSONB       NOT NULL DEFAULT '{}',
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current     BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Only one active schedule per building at a time
CREATE UNIQUE INDEX uq_construction_current_schedule
  ON construction_schedules(building_id)
  WHERE is_current = TRUE;

CREATE INDEX idx_construction_schedules_building
  ON construction_schedules(building_id);
