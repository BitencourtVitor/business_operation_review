-- Reverses 000100. Any row still holding the condition vocabulary is translated
-- back first — normally 000101's down already did it, but a direct rollback to
-- 99 must not fail on the narrowed CHECK.

UPDATE sub_doc_records
   SET status = CASE status
                    WHEN 'regular' THEN 'received'
                    ELSE 'missing'
                END,
       updated_at = now()
 WHERE status IN ('pending', 'regular', 'irregular');

ALTER TABLE sub_doc_records DROP CONSTRAINT IF EXISTS sub_doc_records_status_check;
ALTER TABLE sub_doc_records ADD CONSTRAINT sub_doc_records_status_check
    CHECK (status IN ('missing', 'requested', 'received', 'not_applicable'));

ALTER TABLE sub_doc_types DROP CONSTRAINT IF EXISTS sub_doc_types_status_model_check;
ALTER TABLE sub_doc_types DROP COLUMN IF EXISTS status_model;

UPDATE sub_doc_types SET has_expiry = false WHERE key = 'w9';

ALTER TABLE sub_doc_divisions DROP COLUMN IF EXISTS parent_key;

-- Back to Business Corporation Register last.
UPDATE sub_doc_types SET sort_order = sort_order - 1
 WHERE key <> 'business_corporation_register';
UPDATE sub_doc_types SET sort_order = 8
 WHERE key = 'business_corporation_register';
