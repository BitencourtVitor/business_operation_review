-- Migration to clean up duplicate entries in forecast_contract_steps
-- Logic:
-- 1. Identify duplicates by (obra_id, step)
-- 2. Keep the one with highest priority:
--    - Priority 1: status = true (vs false/null)
--    - Priority 2: most recent lastupdate_datetimez

BEGIN;

-- Remove duplicates
WITH RankedSteps AS (
    SELECT
        id,
        obra_id,
        step,
        status,
        lastupdate_datetimez,
        ROW_NUMBER() OVER (
            PARTITION BY obra_id, step
            ORDER BY
                COALESCE(status, false) DESC, -- Prefer TRUE over FALSE/NULL
                lastupdate_datetimez DESC NULLS LAST, -- Prefer recent dates, then non-nulls over nulls
                id DESC -- Tie-breaker: keep the one with higher ID (often newer)
        ) as rn
    FROM
        public.forecast_contract_steps
    WHERE
        step IS NOT NULL
)
DELETE FROM public.forecast_contract_steps
WHERE id IN (
    SELECT id FROM RankedSteps WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
-- This ensures data integrity going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_contract_steps_unique_step
ON public.forecast_contract_steps (obra_id, step);

COMMIT;
