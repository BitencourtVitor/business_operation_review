-- Audiences settled with Vitor on 2026-08-11, completing what the meeting
-- notes left open. Matched by e-mail so the same migration lands correctly on
-- any environment.
DELETE FROM email_trigger_recipients WHERE trigger_key = 'forecast_plot_plan';

INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
SELECT t.key, t.recipient_type, u.id
FROM (VALUES
    -- The notes never named an audience for this one.
    ('forecast_plot_plan',  'to', 'natalia@premiumgrpinc.com'),
    ('forecast_plot_plan',  'cc', 'thiago@premiumgrpinc.com'),
    -- Kept in copy on the other two so someone sees what goes out.
    ('workers_comp_review', 'cc', 'vitor@premiumgrpinc.com'),
    ('qbtime_absence',      'cc', 'vitor@premiumgrpinc.com')
) AS t(key, recipient_type, email)
JOIN users u ON lower(trim(u.email)) = lower(t.email)
ON CONFLICT DO NOTHING;
