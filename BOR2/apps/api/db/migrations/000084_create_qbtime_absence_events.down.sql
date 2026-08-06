DROP TABLE IF EXISTS qbtime_absence_events;

ALTER TABLE notifications DROP COLUMN IF EXISTS link;

-- `notifications` itself is deliberately NOT dropped: it predates this
-- migration and holds live rows. The up only adopted it.
