DROP INDEX IF EXISTS audit_logs_user_idx;
DROP INDEX IF EXISTS audit_logs_resource_idx;
DROP INDEX IF EXISTS audit_logs_created_at_idx;

ALTER TABLE audit_logs
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS duration_ms,
    DROP COLUMN IF EXISTS user_agent,
    DROP COLUMN IF EXISTS ip,
    DROP COLUMN IF EXISTS payload,
    DROP COLUMN IF EXISTS query,
    DROP COLUMN IF EXISTS status_code,
    DROP COLUMN IF EXISTS path,
    DROP COLUMN IF EXISTS method;
