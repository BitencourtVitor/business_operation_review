-- Cache of QuickBooks Time data for the Period Reports screen, refreshed by a
-- daily sync job. Reading from here avoids the slow live QB Time pagination.

-- Granular timesheet blocks (drives the Intervals view).
CREATE TABLE IF NOT EXISTS qbtime_timesheets (
    company      TEXT        NOT NULL,
    qbt_id       BIGINT      NOT NULL,            -- QB Time timesheet id
    user_id      BIGINT      NOT NULL,
    user_name    TEXT        NOT NULL,            -- "First Last"
    jobcode_id   BIGINT      NOT NULL,
    jobcode_path JSONB       NOT NULL DEFAULT '[]'::jsonb,
    work_date    DATE        NOT NULL,
    start_ts     TEXT        NOT NULL,            -- ISO 8601, stored verbatim
    end_ts       TEXT        NOT NULL,
    duration_min INTEGER     NOT NULL DEFAULT 0,
    type         TEXT        NOT NULL,            -- "regular" | "break"
    is_paid      BOOLEAN     NOT NULL DEFAULT TRUE,
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company, qbt_id)
);
CREATE INDEX IF NOT EXISTS idx_qbtime_timesheets_company_date
    ON qbtime_timesheets (company, work_date);

-- Payroll aggregates per pay period (drives the Job Cost view).
CREATE TABLE IF NOT EXISTS qbtime_payroll (
    company      TEXT        NOT NULL,
    period_end   DATE        NOT NULL,
    user_id      BIGINT      NOT NULL,
    user_name    TEXT        NOT NULL,            -- "Last, First"
    pay_rate     NUMERIC     NOT NULL DEFAULT 0,
    jobcode_id   BIGINT      NOT NULL,
    jobcode_path JSONB       NOT NULL DEFAULT '[]'::jsonb,
    reg_seconds  INTEGER     NOT NULL DEFAULT 0,
    ot_seconds   INTEGER     NOT NULL DEFAULT 0,
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company, period_end, user_id, jobcode_id)
);
CREATE INDEX IF NOT EXISTS idx_qbtime_payroll_company_period
    ON qbtime_payroll (company, period_end);

-- Coverage window per company so reads know whether a range is cached.
CREATE TABLE IF NOT EXISTS qbtime_sync_state (
    company     TEXT        PRIMARY KEY,
    min_date    DATE,
    max_date    DATE,
    last_run_at TIMESTAMPTZ
);
