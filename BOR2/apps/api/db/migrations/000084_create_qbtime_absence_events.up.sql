-- Absence control: employees who stopped clocking in.
--
-- Also regularizes `notifications`, which until now existed only in Railway —
-- it was created by hand and had no migration, so a fresh environment came up
-- without it and the header bell broke. IF NOT EXISTS keeps the live table and
-- its rows untouched.

CREATE TABLE IF NOT EXISTS notifications (
    id           BIGSERIAL   PRIMARY KEY,
    title        TEXT        NOT NULL,
    content      TEXT        NOT NULL,
    recipients   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    viewed_by    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    scheduled_at TIMESTAMPTZ,
    created_by   TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Where the bell sends the user on click. Null for the hand-written ones.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT;

-- One row per block of consecutive business days without a punch. The detector
-- recomputes a rolling window and upserts, so a timesheet corrected after the
-- fact shrinks or deletes the event instead of leaving a ghost behind.
CREATE TABLE IF NOT EXISTS qbtime_absence_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company       TEXT        NOT NULL,
    qbt_user_id   BIGINT      NOT NULL,
    employee_name TEXT        NOT NULL,
    team_name     TEXT        NOT NULL DEFAULT 'Unassigned',
    start_date    DATE        NOT NULL,
    end_date      DATE        NOT NULL,
    days_count    INTEGER     NOT NULL DEFAULT 1,
    -- Set when the notification fired, so a still-open absence is not
    -- re-announced on every daily run.
    notified_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT qbtime_absence_events_company_user_start_key
        UNIQUE (company, qbt_user_id, start_date)
);

CREATE INDEX IF NOT EXISTS qbtime_absence_events_company_end_idx
    ON qbtime_absence_events (company, end_date DESC);
