-- Manual bridge between QB Time jobcode addresses and QBO budget projects.
-- A QB Time "address" is the jobcode path with the work-type leaf removed,
-- e.g. "Toll Brothers (NEW) › Broadleaf at Plymouth › LOT 19". Several jobcodes
-- (one per work type) collapse to a single address → one QBO customer_id.
CREATE TABLE IF NOT EXISTS qbtime_project_mappings (
    id          SERIAL      PRIMARY KEY,
    company     TEXT        NOT NULL,
    address_key TEXT        NOT NULL,      -- jobcode path minus work-type leaf
    customer_id TEXT        NOT NULL,      -- QBO budget project (pkey)
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company, address_key)
);
CREATE INDEX IF NOT EXISTS idx_qbtime_project_mappings_company
    ON qbtime_project_mappings (company);

-- Addresses the operator explicitly skipped (overhead, PTO, no QBO match) so
-- they stop surfacing in the mapping queue.
CREATE TABLE IF NOT EXISTS qbtime_mapping_skips (
    company     TEXT        NOT NULL,
    address_key TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company, address_key)
);
