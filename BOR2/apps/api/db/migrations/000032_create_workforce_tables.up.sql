-- workforce_uploads: one row per CSV upload (company + reference month)
CREATE TABLE IF NOT EXISTS workforce_uploads (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_month TEXT        NOT NULL DEFAULT '',
    company         TEXT        NOT NULL DEFAULT '',
    file_name       TEXT        NOT NULL DEFAULT '',
    record_count    INT         NOT NULL DEFAULT 0,
    total_hours     NUMERIC(10,2) NOT NULL DEFAULT 0,
    uploaded_by     TEXT,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          TEXT        NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_workforce_uploads_month_company
    ON workforce_uploads (reference_month, company);

-- workforce_productivity: individual timesheet rows linked to an upload
CREATE TABLE IF NOT EXISTS workforce_productivity (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID        REFERENCES workforce_uploads(id) ON DELETE CASCADE,
    client          TEXT        NOT NULL DEFAULT '',
    jobsite         TEXT        NOT NULL DEFAULT '',
    lot_building    TEXT        NOT NULL DEFAULT '',
    worktype        TEXT        NOT NULL DEFAULT '',
    employee_name   TEXT        NOT NULL DEFAULT '',
    regular_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
    regular_hours   NUMERIC(10,2) NOT NULL DEFAULT 0,
    reference_month TEXT        NOT NULL DEFAULT '',
    company         TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workforce_productivity_company
    ON workforce_productivity (company);

CREATE INDEX IF NOT EXISTS idx_workforce_productivity_month
    ON workforce_productivity (reference_month);

CREATE INDEX IF NOT EXISTS idx_workforce_productivity_upload_id
    ON workforce_productivity (upload_id);
