-- Gatilho de e-mail do Permit da HVAC.
--
-- Nasce ligado, às 8h de Hopedale, com 30 dias de antecedência sobre o início
-- do Rough. Sem destinatário escolhido em Settings → Email Triggers ele não
-- manda nada — a linha existir só torna o gatilho visível na tela.
INSERT INTO email_triggers (key, enabled, run_hour_local, params)
VALUES ('forecast_permit', TRUE, 8, '{"offset_days": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;
