ALTER TABLE atlas_media
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS transcript;
