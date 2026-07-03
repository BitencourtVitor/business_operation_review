-- BC-20: "ghost" cost accounts — a curated catalog of QB GL accounts that
-- should always be visible (and budget-editable) on a project of the given
-- type, even before any bill/purchase/vendor-credit has posted against them
-- for that specific project. Mirrors budget_categories' role for Contractors
-- Costs, but keyed to a real qb_accounts row (account_ref_id) since By
-- Account budgets are set per account_id in budget_project_account_limits.
CREATE TABLE IF NOT EXISTS budget_ghost_accounts (
    id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company         text        NOT NULL,
    project_type    text        NOT NULL,  -- 'building' | 'lot' | 'private'
    account_ref_id  text        NOT NULL,  -- qb_accounts.external_id
    sort_order      integer     NOT NULL DEFAULT 0,
    active          boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company, project_type, account_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_ghost_accounts_lookup
    ON budget_ghost_accounts (company, project_type);
