-- As quatro datas da HVAC.
--
-- O ciclo da Framing tem três marcos (beams, start, end) e cabe nas colunas
-- previous_*. O da HVAC tem quatro, e cada um é uma visita distinta à obra:
--
--   1. Rough HVAC                        → início da obra
--   2. Air Handler / Gas Furnace Set
--   3. Install Condenser and Thermostat
--   4. HVAC Finish Set A/C               → fim da obra
--
-- As colunas previous_start_date/previous_end_date continuam sendo o início e o
-- fim da obra — é o que todo o resto do sistema lê (métricas, execução mensal,
-- OFI). Para a HVAC elas passam a ser derivadas das etapas, via trigger, para
-- que não exista estado em que a etapa diga uma coisa e o card outra.
ALTER TABLE forecast_core
    ADD COLUMN IF NOT EXISTS hvac_rough_date       DATE,
    ADD COLUMN IF NOT EXISTS hvac_air_handler_date DATE,
    ADD COLUMN IF NOT EXISTS hvac_condenser_date   DATE,
    ADD COLUMN IF NOT EXISTS hvac_finish_date      DATE;

-- Início = a etapa mais cedo que existir, começando pelo Rough; fim = a mais
-- tarde, começando pelo Finish. Obra sem nenhuma etapa preenchida mantém o que
-- já estiver nas colunas — não é papel deste trigger apagar data.
CREATE OR REPLACE FUNCTION forecast_core_hvac_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    stages DATE[];
    first_stage DATE;
    last_stage  DATE;
BEGIN
    IF LOWER(COALESCE(NEW.company, '')) <> 'hvac' THEN
        RETURN NEW;
    END IF;

    stages := ARRAY[NEW.hvac_rough_date, NEW.hvac_air_handler_date,
                    NEW.hvac_condenser_date, NEW.hvac_finish_date];

    SELECT MIN(d), MAX(d) INTO first_stage, last_stage
    FROM unnest(stages) AS d
    WHERE d IS NOT NULL;

    IF first_stage IS NOT NULL THEN
        NEW.previous_start_date := COALESCE(NEW.hvac_rough_date, first_stage);
        NEW.previous_end_date   := COALESCE(NEW.hvac_finish_date, last_stage);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecast_core_hvac_dates_trg ON forecast_core;
CREATE TRIGGER forecast_core_hvac_dates_trg
    BEFORE INSERT OR UPDATE OF hvac_rough_date, hvac_air_handler_date,
                               hvac_condenser_date, hvac_finish_date, company
    ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_hvac_dates();
