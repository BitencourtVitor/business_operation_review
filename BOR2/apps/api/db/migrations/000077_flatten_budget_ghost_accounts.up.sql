-- BC-22: preset accounts (formerly "ghost accounts") stop being scoped per
-- project_type — a project either has this account in the company-wide
-- catalog or it doesn't, regardless of building/lot/private. This table is
-- also no longer used to decide whether a preset row shows on a given
-- project (see injectGhostCostAccounts) — that's now driven entirely by
-- budget_project_account_limits having a budget set for an account with no
-- real activity yet. This table is purely the "known accounts" catalog
-- surfaced in the add-account picker and the Manage grid.
DO $$
DECLARE con text;
BEGIN
  SELECT conname INTO con FROM pg_constraint WHERE conrelid = 'budget_ghost_accounts'::regclass AND contype = 'u';
  IF con IS NOT NULL THEN EXECUTE format('ALTER TABLE budget_ghost_accounts DROP CONSTRAINT %I', con); END IF;
END $$;

DROP INDEX IF EXISTS idx_budget_ghost_accounts_lookup;

CREATE TEMP TABLE ga_dedup AS
SELECT company, account_ref_id, bool_or(active) AS active
FROM budget_ghost_accounts GROUP BY company, account_ref_id;

TRUNCATE budget_ghost_accounts;
ALTER TABLE budget_ghost_accounts DROP COLUMN IF EXISTS project_type;
ALTER TABLE budget_ghost_accounts DROP COLUMN IF EXISTS sort_order;

INSERT INTO budget_ghost_accounts (company, account_ref_id, active)
SELECT company, account_ref_id, active FROM ga_dedup;

ALTER TABLE budget_ghost_accounts ADD CONSTRAINT budget_ghost_accounts_company_account_key UNIQUE (company, account_ref_id);
CREATE INDEX IF NOT EXISTS idx_budget_ghost_accounts_lookup ON budget_ghost_accounts (company);

DROP TABLE ga_dedup;
