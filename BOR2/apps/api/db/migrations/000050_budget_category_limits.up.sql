-- Default budget limit per category × project type
CREATE TABLE IF NOT EXISTS budget_category_limits (
    category_id  UUID    NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
    project_type TEXT    NOT NULL CHECK (project_type IN ('house', 'building')),
    amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY  (category_id, project_type)
);

-- Per-project override — takes precedence over the default above
CREATE TABLE IF NOT EXISTS budget_project_category_limits (
    category_id UUID NOT NULL,
    project_id  TEXT NOT NULL,
    company     TEXT NOT NULL,
    amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    PRIMARY KEY  (category_id, project_id, company)
);
