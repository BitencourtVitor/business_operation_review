-- WEX driver ID → QB Time name mapping (per company)
CREATE TABLE wex_normalization (
  id         BIGSERIAL    PRIMARY KEY,
  company    company_name NOT NULL,
  driver_id  TEXT         NOT NULL,
  wex_name   TEXT         NOT NULL DEFAULT '',
  qb_name    TEXT         NOT NULL,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company, driver_id)
);

CREATE INDEX idx_wex_normalization_company ON wex_normalization(company);

-- WEX allocation reports (meta + full results stored as JSONB)
CREATE TABLE wex_reports (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company     company_name NOT NULL,
  filter_from TEXT         NOT NULL DEFAULT '',
  filter_to   TEXT         NOT NULL DEFAULT '',
  meta        JSONB        NOT NULL DEFAULT '{}',
  results     JSONB        NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wex_reports_company_created ON wex_reports(company, created_at DESC);
