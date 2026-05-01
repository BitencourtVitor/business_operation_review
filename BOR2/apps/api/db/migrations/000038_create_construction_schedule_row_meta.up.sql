CREATE TABLE construction_schedule_row_meta (
  schedule_id  UUID    NOT NULL REFERENCES construction_schedules(id) ON DELETE CASCADE,
  row_id       INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  observation  TEXT    NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (schedule_id, row_id)
);
