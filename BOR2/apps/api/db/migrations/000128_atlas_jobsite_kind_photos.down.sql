DROP INDEX IF EXISTS atlas_media_album_idx;
ALTER TABLE atlas_media DROP COLUMN IF EXISTS album, DROP COLUMN IF EXISTS taken_at;
DROP INDEX IF EXISTS atlas_jobsite_forecast_unico;
ALTER TABLE atlas_jobsite
    DROP COLUMN IF EXISTS kind,
    DROP COLUMN IF EXISTS community,
    DROP COLUMN IF EXISTS unit,
    DROP COLUMN IF EXISTS company,
    DROP COLUMN IF EXISTS forecast_id;
