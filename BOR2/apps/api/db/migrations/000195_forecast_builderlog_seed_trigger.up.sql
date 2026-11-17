-- O Fieldwire foi descontinuado (F-21, 17/11/2026): obra nova da Framing não
-- recebe mais a lista dele, e toda obra precisa nascer com a do BuilderLog.
--
-- O seed do BuilderLog só morava no repositório Go, então obra criada por
-- script (carregadores do Data Att Forecast, rodada de quarta e sexta) nascia
-- sem a lista. Mesma decisão da 000122 para o Permit: resolver no banco vale
-- para qualquer caminho de escrita.
CREATE OR REPLACE FUNCTION forecast_core_seed_builderlog()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF LOWER(COALESCE(NEW.company, '')) <> 'framing' THEN
        RETURN NULL;
    END IF;

    INSERT INTO forecast_builderlog (project_id, document, position)
    SELECT NEW.id, c.document, c.position
      FROM catalog_forecast_builderlog c
     WHERE c.build_type = CASE WHEN LOWER(COALESCE(NEW.type, '')) = 'building' THEN 'building' ELSE 'house' END
       AND (c.client = '' OR LOWER(c.client) = LOWER(COALESCE(NEW.cliente, '')))
    ON CONFLICT (project_id, document) DO NOTHING;

    RETURN NULL;
END;
$$;

-- Trocar empresa, cliente ou tipo traz as linhas que faltam, sem apagar as
-- marcadas (igual ao seedBuilderLog do Go).
DROP TRIGGER IF EXISTS forecast_core_seed_builderlog_trg ON forecast_core;
CREATE TRIGGER forecast_core_seed_builderlog_trg
    AFTER INSERT OR UPDATE OF company, cliente, type ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_seed_builderlog();

-- Obras da Framing que nasceram por script sem a lista.
INSERT INTO forecast_builderlog (project_id, document, position)
SELECT f.id, c.document, c.position
  FROM forecast_core f
  JOIN catalog_forecast_builderlog c
    ON c.build_type = CASE WHEN LOWER(COALESCE(f.type, '')) = 'building' THEN 'building' ELSE 'house' END
   AND (c.client = '' OR LOWER(c.client) = LOWER(COALESCE(f.cliente, '')))
 WHERE LOWER(f.company) = 'framing'
ON CONFLICT (project_id, document) DO NOTHING;
