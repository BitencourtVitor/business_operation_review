-- Recipients and delivery history cascade from the trigger row.
DELETE FROM email_triggers WHERE key = 'workers_comp_result';

ALTER TABLE sub_doc_workers_comp_cycles DROP COLUMN IF EXISTS result_email_sent_at;
