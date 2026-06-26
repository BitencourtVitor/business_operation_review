-- Step 1 of the 22/06 budget-control rework: independent category budgets gain a
-- finer per-sub layer, and vendor→category mapping gains a per-project override.

-- (a) Per-sub (vendor within a category) budget, per project. Optional finer
--     breakdown under a category's independent budget; the sum of subs is shown
--     against the category budget as a non-enforced conference.
CREATE TABLE IF NOT EXISTS budget_project_vendor_limits (
    company     text          NOT NULL,
    project_id  text          NOT NULL,
    category_id uuid          NOT NULL,
    vendor_id   text          NOT NULL,
    amount      numeric(14,2) NOT NULL DEFAULT 0,
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (company, project_id, category_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_proj_vendor_limits
    ON budget_project_vendor_limits (company, project_id);

-- (b) Per-project override of the global vendor→category mapping
--     (budget_vendor_categories is keyed only by company + project_type). A row
--     here wins for that project; no row = fall back to the global mapping.
CREATE TABLE IF NOT EXISTS budget_project_vendor_categories (
    company     text NOT NULL,
    project_id  text NOT NULL,
    vendor_id   text NOT NULL,
    category_id uuid NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company, project_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_proj_vendor_cat
    ON budget_project_vendor_categories (company, project_id);
