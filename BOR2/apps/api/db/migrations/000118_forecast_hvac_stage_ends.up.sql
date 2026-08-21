-- O fim de cada etapa de HVAC.
--
-- As Orders do portal trazem RS e RE por task — início e fim — e até aqui só o
-- início era guardado. Consequência: o fim da obra era o *início* da etapa 4,
-- não o fim dela, e o card não tinha como mostrar quanto dura cada etapa.
--
-- Nas 147 linhas de Orders da primeira carga, RS e RE vêm preenchidos em 100%
-- delas, nas quatro etapas. E não são contíguos: o condenser de uma obra termina
-- 23/01 e a etapa seguinte só começa depois — há folga real entre etapas, então
-- derivar o início de uma do fim da outra seria inventar dado.
ALTER TABLE forecast_core
    ADD COLUMN IF NOT EXISTS hvac_rough_end_date       DATE,
    ADD COLUMN IF NOT EXISTS hvac_air_handler_end_date DATE,
    ADD COLUMN IF NOT EXISTS hvac_condenser_end_date   DATE,
    ADD COLUMN IF NOT EXISTS hvac_finish_end_date      DATE;

-- Início da obra = início do Rough. Fim da obra = fim do Finish. Quando a etapa
-- da ponta não veio nas Orders, cai para a mais extrema que existir — primeiro
-- entre os fins, depois entre os inícios, porque uma etapa sem RE ainda diz que
-- a obra vai pelo menos até o começo dela.
CREATE OR REPLACE FUNCTION forecast_core_hvac_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    starts DATE[];
    ends   DATE[];
    first_start DATE;
    last_end    DATE;
    last_start  DATE;
BEGIN
    IF LOWER(COALESCE(NEW.company, '')) <> 'hvac' THEN
        RETURN NEW;
    END IF;

    starts := ARRAY[NEW.hvac_rough_date, NEW.hvac_air_handler_date,
                    NEW.hvac_condenser_date, NEW.hvac_finish_date];
    ends   := ARRAY[NEW.hvac_rough_end_date, NEW.hvac_air_handler_end_date,
                    NEW.hvac_condenser_end_date, NEW.hvac_finish_end_date];

    SELECT MIN(d), MAX(d) INTO first_start, last_start
    FROM unnest(starts) AS d WHERE d IS NOT NULL;

    SELECT MAX(d) INTO last_end
    FROM unnest(ends) AS d WHERE d IS NOT NULL;

    IF first_start IS NOT NULL OR last_end IS NOT NULL THEN
        NEW.previous_start_date := COALESCE(NEW.hvac_rough_date, first_start);
        NEW.previous_end_date   := COALESCE(NEW.hvac_finish_end_date, last_end, last_start);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecast_core_hvac_dates_trg ON forecast_core;
CREATE TRIGGER forecast_core_hvac_dates_trg
    BEFORE INSERT OR UPDATE OF hvac_rough_date, hvac_air_handler_date,
                               hvac_condenser_date, hvac_finish_date,
                               hvac_rough_end_date, hvac_air_handler_end_date,
                               hvac_condenser_end_date, hvac_finish_end_date,
                               company
    ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_hvac_dates();

-- O histórico precisa enxergar as colunas novas, senão mudança de fim de etapa
-- passaria sem registro — justo a que decide quando a obra acaba.
CREATE OR REPLACE FUNCTION forecast_tracked_date_fields()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY['previous_beams_date', 'previous_start_date', 'previous_end_date',
                 'hvac_rough_date', 'hvac_air_handler_date',
                 'hvac_condenser_date', 'hvac_finish_date',
                 'hvac_rough_end_date', 'hvac_air_handler_end_date',
                 'hvac_condenser_end_date', 'hvac_finish_end_date']
$$;

CREATE OR REPLACE FUNCTION forecast_core_track_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    src   TEXT := COALESCE(NULLIF(current_setting('bor.date_source', true), ''), 'manual');
    who   TEXT := COALESCE(NULLIF(current_setting('bor.changed_by',  true), ''), '');
    field TEXT;
    old_v DATE;
    new_v DATE;
BEGIN
    FOREACH field IN ARRAY forecast_tracked_date_fields()
    LOOP
        EXECUTE format('SELECT ($1).%I, ($2).%I', field, field)
            INTO old_v, new_v
            USING OLD, NEW;

        IF old_v IS DISTINCT FROM new_v THEN
            INSERT INTO forecast_date_history
                (project_id, company, field, old_value, new_value, source, changed_by)
            VALUES (NEW.id, COALESCE(NEW.company, ''), field, old_v, new_v, src, who);
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION forecast_core_track_dates_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    src   TEXT := COALESCE(NULLIF(current_setting('bor.date_source', true), ''), 'manual');
    who   TEXT := COALESCE(NULLIF(current_setting('bor.changed_by',  true), ''), '');
    field TEXT;
    new_v DATE;
BEGIN
    FOREACH field IN ARRAY forecast_tracked_date_fields()
    LOOP
        EXECUTE format('SELECT ($1).%I', field) INTO new_v USING NEW;
        IF new_v IS NOT NULL THEN
            INSERT INTO forecast_date_history
                (project_id, company, field, old_value, new_value, source, changed_by)
            VALUES (NEW.id, COALESCE(NEW.company, ''), field, NULL, new_v, src, who);
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;
