-- Keep the populated copy, merge useful values into it, then prevent the
-- duplicate empty rows that project edits used to seed.
WITH groups AS (
    SELECT lower(project_id) AS project_key,
           lower(trim(title)) AS title_key,
           (array_agg(id ORDER BY
               ((NULLIF(trim(status), '') IS NOT NULL)::int + (NULLIF(trim(unit), '') IS NOT NULL)::int) DESC,
               id
           ))[1] AS keep_id,
           (array_agg(NULLIF(trim(status), '') ORDER BY id)
               FILTER (WHERE NULLIF(trim(status), '') IS NOT NULL))[1] AS merged_status,
           (array_agg(NULLIF(trim(unit), '') ORDER BY id)
               FILTER (WHERE NULLIF(trim(unit), '') IS NOT NULL))[1] AS merged_unit
    FROM forecast_machines
    WHERE trim(title) <> ''
    GROUP BY lower(project_id), lower(trim(title))
    HAVING count(*) > 1
)
UPDATE forecast_machines m
SET status = COALESCE(g.merged_status, m.status),
    unit = COALESCE(g.merged_unit, m.unit),
    updated_at = now()
FROM groups g
WHERE m.id = g.keep_id;

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY lower(project_id), lower(trim(title))
               ORDER BY ((NULLIF(trim(status), '') IS NOT NULL)::int + (NULLIF(trim(unit), '') IS NOT NULL)::int) DESC, id
           ) AS position
    FROM forecast_machines
    WHERE trim(title) <> ''
)
DELETE FROM forecast_machines m
USING ranked r
WHERE m.id = r.id AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS forecast_machines_project_title_unique_idx
    ON forecast_machines (lower(project_id), lower(trim(title)))
    WHERE trim(title) <> '';
