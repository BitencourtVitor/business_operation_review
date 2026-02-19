-- 1. Drop the incorrect index that causes the issue (too restrictive)
DROP INDEX IF EXISTS idx_forecast_contract_steps_unique_step;

-- 2. Cleanup duplicates again, but this time considering 'team'
-- We want to remove duplicates only if they share obra_id, step AND team
-- This preserves steps with the same name but different teams (contracts)
WITH RankedSteps AS (
    SELECT
        id,
        obra_id,
        step,
        team,
        status,
        lastupdate_datetimez,
        ROW_NUMBER() OVER (
            PARTITION BY obra_id, step, team
            ORDER BY
                COALESCE(status, false) DESC, -- Keep true status
                lastupdate_datetimez DESC NULLS LAST, -- Keep most recent
                id DESC -- Tie breaker
        ) as rn
    FROM
        public.forecast_contract_steps
    WHERE
        step IS NOT NULL
)
DELETE FROM public.forecast_contract_steps
WHERE id IN (SELECT id FROM RankedSteps WHERE rn > 1);

-- 3. Create the corrected unique index including 'team'
-- This allows same step name for same project IF the team is different
-- COALESCE(team, '') ensures that NULL teams are treated as a distinct group equivalent to empty string,
-- avoiding duplicate "no-team" steps if that's desired, OR just use (obra_id, step, team) 
-- if we rely on standard SQL behavior (multiple NULLs allowed).
-- Given the app logic uses team names, we'll index the column directly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_contract_steps_unique_team_step
ON public.forecast_contract_steps (obra_id, step, team);
