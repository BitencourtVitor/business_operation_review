UPDATE email_triggers
SET run_hour_local = EXTRACT(HOUR FROM (
        (CURRENT_DATE + make_interval(hours => run_hour_local)) AT TIME ZONE 'America/New_York'
        AT TIME ZONE 'UTC'
    ))
WHERE run_hour_local IS NOT NULL;

ALTER TABLE email_triggers RENAME COLUMN run_hour_local TO run_hour_utc;
