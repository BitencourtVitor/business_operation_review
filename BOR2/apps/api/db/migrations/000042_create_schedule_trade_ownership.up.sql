-- Tracks which trades/resources are performed by our company for a given building.
-- Keyed by building + trade_name so ownership persists across schedule version uploads.
CREATE TABLE schedule_trade_ownership (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID        NOT NULL REFERENCES construction_buildings(id) ON DELETE CASCADE,
  trade_name  TEXT        NOT NULL,
  is_ours     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, trade_name)
);

CREATE INDEX idx_schedule_trade_ownership_building ON schedule_trade_ownership(building_id);
