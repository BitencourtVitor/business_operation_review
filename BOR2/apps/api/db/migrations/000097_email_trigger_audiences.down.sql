DELETE FROM email_trigger_recipients r
USING users u
WHERE r.user_id = u.id
  AND r.trigger_key IN ('workers_comp_review', 'qbtime_absence')
  AND r.recipient_type = 'cc'
  AND lower(trim(u.email)) = 'vitor@premiumgrpinc.com';

DELETE FROM email_trigger_recipients WHERE trigger_key = 'forecast_plot_plan';

INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
SELECT 'forecast_plot_plan', 'to', u.id
FROM users u WHERE lower(trim(u.email)) = 'vitor@premiumgrpinc.com'
ON CONFLICT DO NOTHING;
