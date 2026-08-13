-- The universal "Shared with subcontractor" Fieldwire catalog entry
-- (client = '', type = '') added by migration 000028 is missing from
-- catalog_forecast_fieldwire today, so seedFieldwireDocs stopped adding it
-- to newly created/edited projects, and the original backfill in 000028
-- targeted a stale forecast_projects/obra_id shape instead of the live
-- forecast_core/forecast_fieldwire.project_id shape, leaving 85 of 233
-- projects without the step. Re-add the catalog entry and backfill every
-- project that's still missing it (status = false / to be checked one by one).

INSERT INTO catalog_forecast_fieldwire (id, client, type, document, where_location, notes, created_at)
SELECT COALESCE(MAX(id), 0) + 1, '', '', 'Shared with subcontractor', 'Project Members', '', NOW()
FROM catalog_forecast_fieldwire;

WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_fieldwire)
INSERT INTO forecast_fieldwire (id, project_id, category, document, status)
SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY fc.id),
       fc.id,
       '',
       'Shared with subcontractor',
       false
FROM forecast_core fc, max_id
WHERE NOT EXISTS (
    SELECT 1 FROM forecast_fieldwire ff
    WHERE ff.project_id = fc.id AND ff.document = 'Shared with subcontractor'
);
