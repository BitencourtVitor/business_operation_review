CREATE TABLE audit_logs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text        NOT NULL DEFAULT '',
    user_name   text        NOT NULL DEFAULT '',
    action      text        NOT NULL,
    resource    text        NOT NULL,
    resource_id text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_resource   ON audit_logs (resource);
CREATE INDEX idx_audit_logs_user_id    ON audit_logs (user_id);
