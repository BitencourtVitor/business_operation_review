ALTER TABLE budget_project_account_limits
    DROP COLUMN IF EXISTS deadline;

DROP TABLE IF EXISTS budget_project_dates;
