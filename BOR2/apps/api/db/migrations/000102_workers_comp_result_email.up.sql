-- A second Subcontractor Docs e-mail: the result of the review cycle.
--
-- Not the follow-up that 000096 removed. That one chased whoever came back
-- irregular, and chasing is a person's job. This one reports how the cycle
-- ended — irregular first, then anyone still unchecked, then regular — to the
-- people who track it. The date parameter 000098 dropped comes back here, on
-- the new trigger, so the review keeps owning only its own schedule.
ALTER TABLE sub_doc_workers_comp_cycles
    ADD COLUMN IF NOT EXISTS result_email_sent_at timestamptz;

INSERT INTO email_triggers (key, enabled, run_hour_local, params)
VALUES ('workers_comp_result', true, 8, jsonb_build_object('days_after_review', 1))
ON CONFLICT (key) DO NOTHING;

-- Same audience as the review: the result is read by whoever asked for the
-- check. Matched by e-mail so this lands correctly on any environment.
INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
SELECT t.key, t.recipient_type, u.id
FROM (VALUES
    ('workers_comp_result', 'to', 'officebr08@premiumgrpinc.com'),
    ('workers_comp_result', 'cc', 'thiago@premiumgrpinc.com'),
    ('workers_comp_result', 'cc', 'diego@premiumgrpinc.com')
) AS t(key, recipient_type, email)
JOIN users u ON lower(trim(u.email)) = lower(t.email)
ON CONFLICT DO NOTHING;

-- Cycles that already closed are history: reporting on them now would send a
-- result for a review nobody is still working on.
UPDATE sub_doc_workers_comp_cycles
   SET result_email_sent_at = COALESCE(closed_at, updated_at)
 WHERE status = 'closed' AND result_email_sent_at IS NULL;
