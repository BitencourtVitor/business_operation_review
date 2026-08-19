-- Campos do evento que ficaram de fora na 000109 e que o front lê:
--   recorded_at — quando foi digitado. Diferente de `at`, que é o dia em que o
--                 fato aconteceu; a ordenação da timeline usa os dois.
--   url         — link do SharePoint, no contract_signed.
ALTER TABLE pcg_trade_events
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS url         TEXT;

-- Sem recorded_at a timeline não ordena. Para o que já foi gravado, o melhor
-- valor conhecido é o próprio dia do fato.
UPDATE pcg_trade_events SET recorded_at = at WHERE recorded_at IS NULL;
