-- Budget projects are now derived from the QB customer hierarchy (a string key),
-- not catalog job sites. Per-category limits key on that project_id string.
-- Table is empty in practice; the swap is safe.

DROP INDEX IF EXISTS idx_budget_proj_cat_limits;

ALTER TABLE budget_project_category_limits
    DROP CONSTRAINT IF EXISTS uq_budget_limits_job_site;

ALTER TABLE budget_project_category_limits
    DROP COLUMN IF EXISTS job_site_id,
    ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT '';

ALTER TABLE budget_project_category_limits
    ADD CONSTRAINT uq_budget_limits_project UNIQUE (company, project_id, category_id);

CREATE INDEX idx_budget_proj_cat_limits ON budget_project_category_limits (company, project_id);
