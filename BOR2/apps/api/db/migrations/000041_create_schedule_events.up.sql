-- Event type catalog (seeded with common construction weather/external events)
CREATE TABLE schedule_event_types (
  id         SERIAL      PRIMARY KEY,
  name       TEXT        NOT NULL,
  icon       TEXT        NOT NULL DEFAULT '',
  color      TEXT        NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schedule_event_types (name, icon, color) VALUES
  ('Rain',     'cloud-rain',     '#3b82f6'),
  ('Snow',     'snowflake',      '#93c5fd'),
  ('Holiday',  'calendar-x',     '#f59e0b'),
  ('Wind',     'wind',           '#6b7280'),
  ('Accident', 'triangle-alert', '#ef4444'),
  ('Strike',   'users-round',    '#8b5cf6'),
  ('Other',    'circle-help',    '#a3a3a3');

-- Events linked to a building (not a schedule version — events are building-level)
CREATE TABLE schedule_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id   UUID        NOT NULL REFERENCES construction_buildings(id) ON DELETE CASCADE,
  event_type_id INTEGER     NOT NULL REFERENCES schedule_event_types(id),
  event_date    DATE        NOT NULL,
  days_delayed  INTEGER     NOT NULL DEFAULT 0,
  notes         TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedule_events_building ON schedule_events(building_id);
