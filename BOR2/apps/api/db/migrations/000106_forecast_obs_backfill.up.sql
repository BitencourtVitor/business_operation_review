-- Seeds the trail with the observation each project already carries, so nothing
-- looks unauthored. Credited to "Legacy" since the real author was never recorded;
-- dated today: the real write date is unknown, and tracking starts from here.
INSERT INTO forecast_obs_history (project_id, body, author_id, author_name, author_role, created_at)
SELECT
    fc.id,
    TRIM(fc.obs),
    'legacy',
    'Legacy',
    'system',
    NOW()
FROM forecast_core fc
WHERE COALESCE(TRIM(fc.obs), '') <> ''
  AND NOT EXISTS (
        SELECT 1 FROM forecast_obs_history h
        WHERE LOWER(h.project_id) = LOWER(fc.id)
  );
