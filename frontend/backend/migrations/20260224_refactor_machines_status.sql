ALTER TABLE public.forecast_machines ADD COLUMN status_new text;
UPDATE public.forecast_machines SET status_new = 'Scheduled' WHERE status = true;
UPDATE public.forecast_machines SET status_new = NULL WHERE status = false;
ALTER TABLE public.forecast_machines DROP COLUMN status;
ALTER TABLE public.forecast_machines RENAME COLUMN status_new TO status;
