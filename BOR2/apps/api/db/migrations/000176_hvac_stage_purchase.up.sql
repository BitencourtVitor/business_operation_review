-- Quando o material da etapa foi comprado. A data-limite de compra é calculada
-- do início planejado; sem registrar a compra, toda data vencida aparecia como
-- pendência, mesmo com o material já comprado.
ALTER TABLE forecast_hvac_stages ADD COLUMN IF NOT EXISTS purchased_on DATE;
