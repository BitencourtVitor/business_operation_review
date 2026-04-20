-- Remove the universal "Shared with subcontractor" entry from the catalog
-- and all project-level rows that were seeded by the up migration.
DELETE FROM catalog_forecast_fieldwire
WHERE client = '' AND type = '' AND document = 'Shared with subcontractor';

DELETE FROM forecast_fieldwire
WHERE document = 'Shared with subcontractor' AND category = '';
