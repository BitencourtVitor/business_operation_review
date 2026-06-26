-- Step 3 of the 22/06 budget-control rework: let the user flag which payees of a
-- cost account (Payroll-COGS being the main case) are supervisors, per project,
-- so the account can be split into supervisor vs normal labor. Presence of a row
-- = that vendor/employee is a supervisor for that account on that project.
CREATE TABLE IF NOT EXISTS budget_payroll_supervisors (
    company    text NOT NULL,
    project_id text NOT NULL,
    account_id text NOT NULL,   -- qb_accounts.external_id
    vendor_id  text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company, project_id, account_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_payroll_supervisors
    ON budget_payroll_supervisors (company, project_id, account_id);
