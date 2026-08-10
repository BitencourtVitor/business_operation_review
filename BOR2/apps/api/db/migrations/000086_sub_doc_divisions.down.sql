DROP INDEX IF EXISTS idx_sub_doc_records_unique;

-- Only one division per contractor survives the round trip, so collapse to the
-- first one before restoring the old uniqueness.
DELETE FROM sub_doc_records a
 USING sub_doc_records b
 WHERE a.contractor_id = b.contractor_id
   AND a.doc_type = b.doc_type
   AND a.id > b.id;

ALTER TABLE sub_doc_records ADD CONSTRAINT sub_doc_records_contractor_id_doc_type_key
    UNIQUE (contractor_id, doc_type);

ALTER TABLE sub_doc_records DROP COLUMN IF EXISTS division;

DROP TABLE IF EXISTS sub_doc_type_divisions;
DROP TABLE IF EXISTS sub_doc_contractor_divisions;
DROP TABLE IF EXISTS sub_doc_divisions;
