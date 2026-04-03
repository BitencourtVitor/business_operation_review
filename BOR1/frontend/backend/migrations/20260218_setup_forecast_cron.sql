-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to trigger the Edge Function
CREATE OR REPLACE FUNCTION public.trigger_forecast_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Replace with your actual project URL and Service Role Key
  -- Example: https://xxxxxxxx.supabase.co/functions/v1/forecast_alerts
  edge_function_url text := 'https://<PROJECT_REF>.supabase.co/functions/v1/forecast_alerts';
  service_role_key text := '<SERVICE_ROLE_KEY>';
BEGIN
  -- Call the Edge Function using pg_net
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule the cron job to run daily at 8:00 AM UTC
-- The job name 'forecast-daily-alert' ensures we don't create duplicates if run multiple times
SELECT cron.schedule(
  'forecast-daily-alert',
  '0 8 * * *', -- At 08:00 every day
  'SELECT public.trigger_forecast_alerts()'
);

-- Optional: Run immediately to test (uncomment to test)
-- SELECT public.trigger_forecast_alerts();
