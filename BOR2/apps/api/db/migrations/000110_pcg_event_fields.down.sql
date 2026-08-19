ALTER TABLE pcg_trade_events
    DROP COLUMN IF EXISTS url,
    DROP COLUMN IF EXISTS recorded_at;
