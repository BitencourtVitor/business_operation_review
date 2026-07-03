ALTER TABLE budget_ghost_accounts DROP CONSTRAINT IF EXISTS budget_ghost_accounts_company_account_key;
ALTER TABLE budget_ghost_accounts ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'building';
ALTER TABLE budget_ghost_accounts ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE budget_ghost_accounts ADD CONSTRAINT budget_ghost_accounts_company_project_type_account_ref_id_key UNIQUE (company, project_type, account_ref_id);
