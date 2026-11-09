-- ME-27: dia em que a obra começou, para o Started do Monthly Execution contar
-- toda obra que começou no mês, planejada ou não. Mesmo desenho do finished_on
-- (000186): o Forecast muda o status e o gatilho grava sozinho; voltar para
-- not started apaga.
ALTER TABLE forecast_core ADD COLUMN IF NOT EXISTS started_on date;

CREATE OR REPLACE FUNCTION forecast_core_started_on() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'not started' THEN
      NEW.started_on := NULL;
    ELSIF NEW.status IN ('open', 'closed') AND (OLD.status IS NULL OR OLD.status = 'not started') THEN
      NEW.started_on := (now() AT TIME ZONE 'America/New_York')::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forecast_core_started_on ON forecast_core;
CREATE TRIGGER forecast_core_started_on
  BEFORE UPDATE OF status ON forecast_core
  FOR EACH ROW EXECUTE FUNCTION forecast_core_started_on();

-- Passado: o histórico de alterações (audit_row_history) existe desde 31/08/2026.
-- Vale a última passagem de not started para open/closed de quem ainda está
-- open/closed; obra que começou antes disso fica sem data.
UPDATE forecast_core fc SET started_on = h.day
FROM (
  SELECT DISTINCT ON (row_pk->>'id') row_pk->>'id' AS id, (changed_at AT TIME ZONE 'America/New_York')::date AS day
  FROM audit_row_history
  WHERE table_name = 'forecast_core'
    AND 'status' = ANY(changed_fields)
    AND COALESCE(old_row->>'status', 'not started') = 'not started'
    AND new_row->>'status' IN ('open', 'closed')
  ORDER BY row_pk->>'id', changed_at DESC
) h
WHERE fc.id::text = h.id AND fc.status IN ('open', 'closed') AND fc.started_on IS NULL;

-- WF-39: work types que ficam fora do orçamento, por prédio. NULL = usa a lista
-- geral do settings (wp_insights_settings.ignored_worktypes).
ALTER TABLE wp_building_links ADD COLUMN IF NOT EXISTS ignored_worktypes text[];
