-- Migration to add automatic enrichment for timesheet_data_new
-- Ideally, this trigger will fill in missing details (lot_building, worktype, client) based on the jobsite match in workforce_projects

BEGIN;

-- 1. Create the enrichment function
CREATE OR REPLACE FUNCTION public.enrich_timesheet_data()
RETURNS TRIGGER AS $$
DECLARE
  project_record RECORD;
BEGIN
  -- Validate if jobsite exists
  IF NEW.jobsite IS NULL THEN
    RETURN NEW;
  END IF;

  -- Attempt to find a matching project in workforce_projects
  -- Using TRIM and LOWER for better matching probability
  SELECT * INTO project_record
  FROM public.workforce_projects
  WHERE LOWER(TRIM(job_site)) = LOWER(TRIM(NEW.jobsite))
  LIMIT 1;

  IF FOUND THEN
    -- Fill lot_building if it is NULL
    IF NEW.lot_building IS NULL THEN
      NEW.lot_building := project_record.lote_building::text;
    END IF;

    -- Fill worktype if it is NULL, using the project's 'type'
    IF NEW.worktype IS NULL THEN
      NEW.worktype := project_record.type;
    END IF;

    -- Fill client if it is NULL
    IF NEW.client IS NULL THEN
      NEW.client := project_record.cliente;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS enrich_timesheet_data_trigger ON public.timesheet_data_new;

CREATE TRIGGER enrich_timesheet_data_trigger
BEFORE INSERT OR UPDATE ON public.timesheet_data_new
FOR EACH ROW
EXECUTE FUNCTION public.enrich_timesheet_data();

-- 3. Backfill existing data
UPDATE public.timesheet_data_new t
SET
  lot_building = COALESCE(t.lot_building, p.lote_building::text),
  worktype = COALESCE(t.worktype, p.type),
  client = COALESCE(t.client, p.cliente)
FROM public.workforce_projects p
WHERE LOWER(TRIM(t.jobsite)) = LOWER(TRIM(p.job_site))
  AND (t.lot_building IS NULL OR t.worktype IS NULL OR t.client IS NULL);

COMMIT;
