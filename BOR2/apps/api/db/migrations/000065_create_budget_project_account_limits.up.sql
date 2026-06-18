-- Per-project spending ceiling per QB GL account ("cost budget mapping").
-- The total cost budget (estimate × (1 − margin)) is distributed across the
-- project's cost accounts. The Contractors account is derived (Σ PO committed),
-- locked, and not stored here; every other account's ceiling is set by hand.
CREATE TABLE IF NOT EXISTS budget_project_account_limits (
    company    text          NOT NULL,
    project_id text          NOT NULL,
    account_id text          NOT NULL,   -- qb_accounts.external_id (or 'noacct')
    amount     numeric(14,2) NOT NULL DEFAULT 0,
    updated_at timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (company, project_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_proj_acct_limits
    ON budget_project_account_limits (company, project_id);
