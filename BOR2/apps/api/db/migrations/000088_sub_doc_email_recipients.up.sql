-- Recipients are system users, not hardcoded names or e-mail addresses. A
-- separate configuration exists for the review and irregularity messages.
CREATE TABLE IF NOT EXISTS sub_doc_email_recipient_settings (
    alert_type text PRIMARY KEY CHECK (alert_type IN ('workers_comp_review', 'workers_comp_irregularity')),
    updated_by text REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sub_doc_email_recipients (
    alert_type text NOT NULL REFERENCES sub_doc_email_recipient_settings(alert_type) ON DELETE CASCADE,
    recipient_type text NOT NULL CHECK (recipient_type IN ('to', 'cc')),
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (alert_type, recipient_type, user_id)
);

INSERT INTO sub_doc_email_recipient_settings (alert_type) VALUES
    ('workers_comp_review'),
    ('workers_comp_irregularity')
ON CONFLICT (alert_type) DO NOTHING;
