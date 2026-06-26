-- Step 7 of the 22/06 rework: spend-vs-receive health band. variability_pct is the
-- tolerance (in percentage points) within which cost progress may differ from
-- income progress before it is flagged as over/under spending.
ALTER TABLE qb_budget_settings
    ADD COLUMN IF NOT EXISTS variability_pct numeric NOT NULL DEFAULT 5;
