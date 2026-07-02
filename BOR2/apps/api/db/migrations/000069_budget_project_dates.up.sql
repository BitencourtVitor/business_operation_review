-- Manual project start date (one row per project) and per-account deadline,
-- used to draw a progressive budget-adherence line (DistributionChart /
-- AccountChartPanel) instead of a flat ceiling.
CREATE TABLE IF NOT EXISTS budget_project_dates (
    company    text        NOT NULL,
    project_id text        NOT NULL,
    start_date date,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company, project_id)
);

ALTER TABLE budget_project_account_limits
    ADD COLUMN IF NOT EXISTS deadline date;
