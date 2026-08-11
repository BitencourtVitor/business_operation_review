-- A test send is a real delivery and must stay traceable, but it is not an
-- alert: it gets its own status so the history can show it without it being
-- counted as an e-mail the trigger fired.
ALTER TABLE email_trigger_deliveries
    DROP CONSTRAINT IF EXISTS email_trigger_deliveries_status_check;

ALTER TABLE email_trigger_deliveries
    ADD CONSTRAINT email_trigger_deliveries_status_check
    CHECK (status IN ('sent', 'failed', 'test'));
