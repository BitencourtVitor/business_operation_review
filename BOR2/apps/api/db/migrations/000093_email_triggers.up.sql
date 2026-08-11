-- Central registry for every automatic e-mail the system fires. Subject and
-- body stay in code (they are built from live data); what lives here is when
-- the trigger runs, whether it runs at all, its business parameters, and who
-- receives it.
CREATE TABLE IF NOT EXISTS email_triggers (
    key          text PRIMARY KEY,
    enabled      boolean NOT NULL DEFAULT true,
    -- NULL when the trigger has no schedule of its own (it rides another job).
    run_hour_utc int CHECK (run_hour_utc BETWEEN 0 AND 23),
    params       jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by   text REFERENCES users(id) ON DELETE SET NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Recipients are system users, never literal addresses: a deactivated user
-- stops receiving without anyone remembering to edit a list.
CREATE TABLE IF NOT EXISTS email_trigger_recipients (
    trigger_key    text NOT NULL REFERENCES email_triggers(key) ON DELETE CASCADE,
    recipient_type text NOT NULL CHECK (recipient_type IN ('to', 'cc')),
    user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (trigger_key, recipient_type, user_id)
);

CREATE TABLE IF NOT EXISTS email_trigger_deliveries (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_key  text NOT NULL REFERENCES email_triggers(key) ON DELETE CASCADE,
    subject      text NOT NULL DEFAULT '',
    to_addresses text[] NOT NULL DEFAULT '{}',
    cc_addresses text[] NOT NULL DEFAULT '{}',
    context      text NOT NULL DEFAULT '',
    delivery_id  text,
    status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    error        text NOT NULL DEFAULT '',
    sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_trigger_deliveries_key_sent_at_idx
    ON email_trigger_deliveries (trigger_key, sent_at DESC);

-- Seeded with exactly the values that were hardcoded before this migration,
-- so turning the screen on changes nothing until someone edits a field.
INSERT INTO email_triggers (key, enabled, run_hour_utc, params) VALUES
    ('forecast_plot_plan', true, 12, '{"client":"toll brothers","date_field":"previous_start_date","offset_value":2,"offset_unit":"months"}'::jsonb),
    ('workers_comp_review', true, 12, '{"anchor_date":"2026-08-13","cycle_days":14}'::jsonb),
    ('workers_comp_communication', true, 12, '{"days_after_review":1}'::jsonb),
    ('qbtime_absence', true, NULL, '{"alert_days":2,"window_days":21}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Carry the single shared list over to every trigger, which is precisely the
-- routing in place today. Splitting it is now a screen edit, not a migration.
INSERT INTO email_trigger_recipients (trigger_key, recipient_type, user_id)
SELECT t.key, r.recipient_type, r.user_id
FROM email_triggers t
CROSS JOIN sub_doc_email_recipients r
WHERE r.alert_type = 'workers_comp'
ON CONFLICT DO NOTHING;
