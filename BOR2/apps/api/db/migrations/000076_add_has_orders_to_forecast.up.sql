-- FF-1: Has Orders — indicates which data source to trust for a Toll Brothers
-- project's dates: the more precise "Orders" page (once orders exist) vs.
-- "Job Schedule" (covers future projects Orders doesn't have yet).
ALTER TABLE forecast_core ADD COLUMN IF NOT EXISTS has_orders boolean NOT NULL DEFAULT false;

-- Backfill: no job starts without orders already placed, so Open/Closed
-- projects are automatically true. Not Started/Overdue are left false,
-- pending manual confirmation per project.
UPDATE forecast_core
SET has_orders = true
WHERE lower(cliente) LIKE 'toll brothers%'
  AND lower(status) IN ('open', 'closed');
