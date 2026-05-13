CREATE TABLE IF NOT EXISTS qbtime_exceptions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company       TEXT        NOT NULL,
    employee_name TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company, employee_name)
);
