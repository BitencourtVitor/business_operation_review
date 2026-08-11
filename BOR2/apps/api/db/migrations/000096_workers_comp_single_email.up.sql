-- The irregularity e-mail is gone. The system asks for the survey once, on the
-- review date; chasing whoever came back irregular is a person's job, not a
-- second notification. The follow-up date survives as the day the cycle closes,
-- so its parameter moves onto the review trigger.
UPDATE email_triggers
SET params = params || jsonb_build_object(
        'days_after_review',
        COALESCE(
            (SELECT (c.params->>'days_after_review')::int
             FROM email_triggers c WHERE c.key = 'workers_comp_communication'),
            1
        )
    ),
    updated_at = now()
WHERE key = 'workers_comp_review';

-- Cascades its recipients and its delivery history.
DELETE FROM email_triggers WHERE key = 'workers_comp_communication';

-- Recipients from the 2026-08-10 meeting notes. Matched by e-mail so the same
-- migration lands correctly on any environment. The validation phase is over:
-- these lists are the real audience.
DELETE FROM email_trigger_recipients WHERE trigger_key IN ('workers_comp_review', 'qbtime_absence');

INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
SELECT t.key, t.recipient_type, u.id
FROM (VALUES
    ('workers_comp_review', 'to', 'officebr08@premiumgrpinc.com'),
    ('workers_comp_review', 'cc', 'thiago@premiumgrpinc.com'),
    ('workers_comp_review', 'cc', 'diego@premiumgrpinc.com'),
    ('qbtime_absence',      'to', 'service.hvac@premiumgrpinc.com'),
    ('qbtime_absence',      'to', 'florence@premiumgrpinc.com'),
    ('qbtime_absence',      'cc', 'thiago@premiumgrpinc.com'),
    ('qbtime_absence',      'cc', 'diego@premiumgrpinc.com')
) AS t(key, recipient_type, email)
JOIN users u ON lower(trim(u.email)) = lower(t.email)
ON CONFLICT DO NOTHING;
