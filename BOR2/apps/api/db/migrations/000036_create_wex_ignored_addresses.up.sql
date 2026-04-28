-- Per-company list of QB Time job codes to exclude from WEX cost allocation.
-- When a driver's only work entries for a day are on ignored addresses, the
-- WEX transaction is marked as Office (no billable jobcode).
CREATE TABLE wex_ignored_addresses (
  id         BIGSERIAL    PRIMARY KEY,
  company    company_name NOT NULL,
  address    TEXT         NOT NULL,          -- QB Time job code value to ignore
  note       TEXT         NOT NULL DEFAULT '',
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company, address)
);

CREATE INDEX idx_wex_ignored_addresses_company ON wex_ignored_addresses(company);
