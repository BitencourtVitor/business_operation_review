-- Migration to add the reason column to monthly_execution_history
-- Since the previous migration already handled the DROPs, this focuses only on the new field

ALTER TABLE public.monthly_execution_history 
ADD COLUMN IF NOT EXISTS reason TEXT;

COMMENT ON COLUMN public.monthly_execution_history.reason IS 'Explanation or description provided via BOR about what happened with the project execution.';
