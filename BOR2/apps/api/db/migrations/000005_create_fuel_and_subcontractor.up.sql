-- Samsara events
CREATE TYPE fuel_event_type AS ENUM ('trip', 'idle');

CREATE TABLE samsara_events (
  id          TEXT           PRIMARY KEY,
  event_key   TEXT           NOT NULL UNIQUE,
  event_date  DATE           NOT NULL,
  driver_name TEXT           NOT NULL,
  location    TEXT           NOT NULL DEFAULT '',
  distance    NUMERIC(10,2)  NOT NULL DEFAULT 0,
  units       TEXT           NOT NULL DEFAULT '',
  type        fuel_event_type NOT NULL,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_samsara_driver ON samsara_events(driver_name);
CREATE INDEX idx_samsara_date   ON samsara_events(event_date);

-- WEX transactions
CREATE TABLE wex_transactions (
  id               TEXT          PRIMARY KEY,
  transaction_key  TEXT          NOT NULL UNIQUE,
  transaction_date DATE          NOT NULL,
  driver_name      TEXT          NOT NULL,
  units            NUMERIC(10,3) NOT NULL DEFAULT 0,
  total_fuel_cost  NUMERIC(10,2) NOT NULL DEFAULT 0,
  merchant_city    TEXT          NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wex_driver ON wex_transactions(driver_name);
CREATE INDEX idx_wex_date   ON wex_transactions(transaction_date);

-- Subcontractor performance
CREATE TYPE subcontractor_status AS ENUM ('active', 'inactive', 'suspended', 'pending');

CREATE TABLE subcontractor_performance (
  id                 TEXT                 PRIMARY KEY,
  company            company_name         NOT NULL,
  subcontractor_name TEXT                 NOT NULL,
  status             subcontractor_status NOT NULL DEFAULT 'pending',
  performance_score  NUMERIC(5,2)         NOT NULL DEFAULT 0,
  completed_projects INTEGER              NOT NULL DEFAULT 0,
  active_projects    INTEGER              NOT NULL DEFAULT 0,
  last_event_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subcontractor_company ON subcontractor_performance(company);
CREATE INDEX idx_subcontractor_status  ON subcontractor_performance(status);
