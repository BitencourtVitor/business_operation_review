CREATE TABLE IF NOT EXISTS forecast_email_deliveries (
    project_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    target_date DATE NOT NULL,
    delivery_id TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, alert_type, target_date)
);

CREATE INDEX IF NOT EXISTS forecast_email_deliveries_sent_at_idx
    ON forecast_email_deliveries (sent_at DESC);
