CREATE TABLE construction_schedule_row_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID        NOT NULL REFERENCES construction_schedules(id) ON DELETE CASCADE,
  row_id      INTEGER     NOT NULL,
  user_name   TEXT        NOT NULL DEFAULT '',
  body        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_row_comments ON construction_schedule_row_comments(schedule_id, row_id);
