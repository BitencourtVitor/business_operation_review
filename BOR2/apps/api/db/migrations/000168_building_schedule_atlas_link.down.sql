DROP INDEX IF EXISTS uq_construction_buildings_atlas_jobsite;
ALTER TABLE construction_buildings DROP COLUMN IF EXISTS atlas_jobsite_id;
