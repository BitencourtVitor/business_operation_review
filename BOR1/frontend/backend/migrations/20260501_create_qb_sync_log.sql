CREATE TABLE IF NOT EXISTS qb_sync_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company         TEXT        NOT NULL,
  script          TEXT        NOT NULL,
  rows_fetched    INT,
  rows_sent       INT,
  status          TEXT        NOT NULL CHECK (status IN ('success', 'error')),
  error_message   TEXT,
  duration_ms     INT
);

CREATE INDEX idx_qb_sync_log_ran_at  ON qb_sync_log (ran_at DESC);
CREATE INDEX idx_qb_sync_log_run_id  ON qb_sync_log (run_id);
CREATE INDEX idx_qb_sync_log_company ON qb_sync_log (company);
