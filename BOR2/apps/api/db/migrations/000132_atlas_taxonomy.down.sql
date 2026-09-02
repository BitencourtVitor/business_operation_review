DROP INDEX IF EXISTS atlas_document_slot_uniq;

ALTER TABLE atlas_document
    DROP COLUMN IF EXISTS category_id,
    DROP COLUMN IF EXISTS subcategory;

ALTER TABLE atlas_jobsite
    DROP COLUMN IF EXISTS floors,
    DROP COLUMN IF EXISTS unit_labels;

DROP TABLE IF EXISTS atlas_doc_category;
