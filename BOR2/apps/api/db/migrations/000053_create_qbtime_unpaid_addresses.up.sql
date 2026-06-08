-- Operator-defined unpaid addresses (Pillar 2). Any timesheet block whose full
-- jobcode path matches one of these is treated as unpaid, overriding the QB Time
-- type. Matched on the exact full path string shown in the report.
CREATE TABLE IF NOT EXISTS qbtime_unpaid_addresses (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company    TEXT        NOT NULL,
    address    TEXT        NOT NULL,            -- full path, e.g. "Pulte › Canton › Building 1 › Normal Labor"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company, address)
);
CREATE INDEX IF NOT EXISTS idx_qbtime_unpaid_addresses_company
    ON qbtime_unpaid_addresses (company);
