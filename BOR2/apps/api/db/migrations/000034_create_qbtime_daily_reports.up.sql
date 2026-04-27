CREATE TABLE qbtime_daily_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company         TEXT        NOT NULL,
    date            DATE        NOT NULL,
    file_name       TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_id   TEXT        NOT NULL DEFAULT '',
    created_by_name TEXT        NOT NULL DEFAULT '',
    CONSTRAINT qbtime_daily_reports_company_date_key UNIQUE (company, date)
);

CREATE TABLE qbtime_daily_report_entries (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id        UUID         NOT NULL REFERENCES qbtime_daily_reports(id) ON DELETE CASCADE,
    employee_raw     TEXT         NOT NULL,
    employee_display TEXT         NOT NULL,
    job_code         TEXT         NOT NULL,
    regular_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,
    overtime_hours   NUMERIC(8,2) NOT NULL DEFAULT 0,
    total_hours      NUMERIC(8,2) NOT NULL DEFAULT 0
);

CREATE INDEX qbtime_daily_report_entries_report_id_idx
    ON qbtime_daily_report_entries(report_id);
