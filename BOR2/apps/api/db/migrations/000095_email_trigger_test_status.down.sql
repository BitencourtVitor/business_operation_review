DELETE FROM email_trigger_deliveries WHERE status = 'test';

ALTER TABLE email_trigger_deliveries
    DROP CONSTRAINT IF EXISTS email_trigger_deliveries_status_check;

ALTER TABLE email_trigger_deliveries
    ADD CONSTRAINT email_trigger_deliveries_status_check
    CHECK (status IN ('sent', 'failed'));
