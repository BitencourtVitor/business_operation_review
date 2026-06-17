-- Migrate budget_project_category_limits from customer_id (QB) to job_site_id (catalog).
-- Projects are now the central entity; limits are per catalog_job_site, not per QB customer.
-- Table is empty in practice; dropping customer_id cascades its unique/not-null constraints.

DROP INDEX IF EXISTS idx_budget_proj_cat_limits;

ALTER TABLE budget_project_category_limits
    DROP COLUMN IF EXISTS customer_id,
    ADD COLUMN IF NOT EXISTS job_site_id BIGINT REFERENCES catalog_job_sites(id) ON DELETE CASCADE;

ALTER TABLE budget_project_category_limits
    ADD CONSTRAINT uq_budget_limits_job_site UNIQUE (company, job_site_id, category_id);

CREATE INDEX idx_budget_proj_cat_limits ON budget_project_category_limits (company, job_site_id);
