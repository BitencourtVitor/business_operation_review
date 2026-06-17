DROP INDEX IF EXISTS idx_budget_proj_cat_limits;

ALTER TABLE budget_project_category_limits
    DROP CONSTRAINT IF EXISTS uq_budget_limits_project;

ALTER TABLE budget_project_category_limits
    DROP COLUMN IF EXISTS project_id,
    ADD COLUMN IF NOT EXISTS job_site_id BIGINT REFERENCES catalog_job_sites(id) ON DELETE CASCADE;

ALTER TABLE budget_project_category_limits
    ADD CONSTRAINT uq_budget_limits_job_site UNIQUE (company, job_site_id, category_id);

CREATE INDEX idx_budget_proj_cat_limits ON budget_project_category_limits (company, job_site_id);
