-- The hour is now stored in the company's own time zone (America/New_York),
-- the same one every date calculation in the system already uses. Stored in
-- UTC it drifted an hour twice a year: 12:00 UTC is 08:00 in Hopedale during
-- daylight saving and 07:00 outside it.
ALTER TABLE email_triggers RENAME COLUMN run_hour_utc TO run_hour_local;

UPDATE email_triggers
SET run_hour_local = EXTRACT(HOUR FROM (
        (CURRENT_DATE + make_interval(hours => run_hour_local)) AT TIME ZONE 'UTC'
        AT TIME ZONE 'America/New_York'
    ))
WHERE run_hour_local IS NOT NULL;
