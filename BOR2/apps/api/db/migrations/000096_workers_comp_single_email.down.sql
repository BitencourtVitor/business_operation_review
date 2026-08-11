INSERT INTO email_triggers (key, enabled, run_hour_utc, params)
VALUES ('workers_comp_communication', true, 12,
        jsonb_build_object('days_after_review',
            COALESCE((SELECT (params->>'days_after_review')::int
                      FROM email_triggers WHERE key = 'workers_comp_review'), 1)))
ON CONFLICT (key) DO NOTHING;

INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
SELECT 'workers_comp_communication', recipient_type, user_id
FROM email_trigger_recipients WHERE trigger_key = 'workers_comp_review'
ON CONFLICT DO NOTHING;

UPDATE email_triggers
SET params = params - 'days_after_review', updated_at = now()
WHERE key = 'workers_comp_review';
