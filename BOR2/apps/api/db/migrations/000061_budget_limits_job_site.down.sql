DROP INDEX IF EXISTS idx_budget_proj_cat_limits;

ALTER TABLE budget_project_category_limits
    DROP CONSTRAINT IF EXISTS uq_budget_limits_job_site;

ALTER TABLE budget_project_category_limits
    DROP COLUMN IF EXISTS job_site_id,
    ADD COLUMN IF NOT EXISTS customer_id TEXT NOT NULL DEFAULT '';

ALTER TABLE budget_project_category_limits
    ADD CONSTRAINT budget_project_category_limit_company_customer_id_category__key
    UNIQUE (company, customer_id, category_id);

CREATE INDEX idx_budget_proj_cat_limits ON budget_project_category_limits (company, customer_id);
