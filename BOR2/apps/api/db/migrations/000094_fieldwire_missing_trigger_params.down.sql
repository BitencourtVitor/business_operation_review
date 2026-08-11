UPDATE email_triggers
SET params = (params - 'clients' - 'documents')
           || jsonb_build_object('client', lower(COALESCE(params->'clients'->>0, 'toll brothers'))),
    updated_at = now()
WHERE key = 'forecast_plot_plan';
