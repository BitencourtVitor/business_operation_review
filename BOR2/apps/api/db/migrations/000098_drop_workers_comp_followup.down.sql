ALTER TABLE sub_doc_workers_comp_cycles RENAME COLUMN closed_at TO communication_sent_at;
ALTER TABLE sub_doc_workers_comp_cycles ADD COLUMN IF NOT EXISTS communication_date date;
UPDATE sub_doc_workers_comp_cycles SET communication_date = review_date + 1 WHERE communication_date IS NULL;
ALTER TABLE sub_doc_workers_comp_cycles ALTER COLUMN communication_date SET NOT NULL;

UPDATE email_triggers
SET params = params || jsonb_build_object('days_after_review', 1), updated_at = now()
WHERE key = 'workers_comp_review';

UPDATE email_triggers
SET params = params || jsonb_build_object('window_days', 21), updated_at = now()
WHERE key = 'qbtime_absence';
