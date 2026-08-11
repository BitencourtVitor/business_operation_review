-- The Forecast trigger stopped being "Plot Plan, by date only" and became
-- "these Fieldwire documents are missing, for these clients". The single
-- `client` string becomes a `clients` list, and `documents` starts with the
-- one document the alert used to be about, so the change of meaning does not
-- silently widen what gets alerted.
UPDATE email_triggers
SET params = (params - 'client')
           || jsonb_build_object(
                  'clients',
                  CASE
                      WHEN COALESCE(trim(params->>'client'), '') = '' THEN '["Toll Brothers"]'::jsonb
                      ELSE jsonb_build_array(
                          COALESCE(
                              (SELECT c.name FROM catalog_clients c
                               WHERE lower(trim(c.name)) = lower(trim(params->>'client'))
                               LIMIT 1),
                              initcap(trim(params->>'client'))
                          )
                      )
                  END
              )
           || CASE
                  WHEN params ? 'documents' THEN '{}'::jsonb
                  ELSE jsonb_build_object('documents', '["Plot Plan"]'::jsonb)
              END,
    updated_at = now()
WHERE key = 'forecast_plot_plan';
