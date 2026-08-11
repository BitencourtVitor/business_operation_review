-- There is no follow-up e-mail, so there is no follow-up date to configure.
-- A cycle now runs until the next one opens, which is the whole cadence:
-- send, and fourteen days later send again.
ALTER TABLE sub_doc_workers_comp_cycles DROP COLUMN IF EXISTS communication_date;
ALTER TABLE sub_doc_workers_comp_cycles RENAME COLUMN communication_sent_at TO closed_at;

UPDATE email_triggers
SET params = params - 'days_after_review', updated_at = now()
WHERE key = 'workers_comp_review';

-- The lookback window is an implementation detail of the detector, not a
-- business knob: it stops being editable on the screen.
UPDATE email_triggers
SET params = params - 'window_days', updated_at = now()
WHERE key = 'qbtime_absence';
