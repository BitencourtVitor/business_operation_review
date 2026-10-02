ALTER TABLE catalog_job_sites
  DROP COLUMN IF EXISTS source_name,
  DROP COLUMN IF EXISTS responsibles,
  DROP COLUMN IF EXISTS hvac;
