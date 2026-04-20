-- Add a universal "Shared with subcontractor" check to the Fieldwire catalog.
-- Universal entries have client = '' and type = '', meaning they apply to ALL
-- projects regardless of client or project type.
--
-- Also backfills the item into every existing project with status = false.
-- Projects where sharing was already done will need to be manually checked off —
-- there is no way to infer the prior state from existing data.

-- 1. Insert the universal catalog entry
INSERT INTO catalog_forecast_fieldwire (id, client, type, document, where_location, notes, created_at)
SELECT COALESCE(MAX(id), 0) + 1, '', '', 'Shared with subcontractor', 'Project Members', '', NOW()
FROM catalog_forecast_fieldwire;

-- 2. Backfill all existing projects (status = false / incomplete by default)
INSERT INTO forecast_fieldwire (project_id, category, document, status)
SELECT fc.id, '', 'Shared with subcontractor', false
FROM forecast_core fc
WHERE NOT EXISTS (
    SELECT 1 FROM forecast_fieldwire ff
    WHERE LOWER(ff.project_id) = LOWER(fc.id)
      AND ff.document = 'Shared with subcontractor'
);
