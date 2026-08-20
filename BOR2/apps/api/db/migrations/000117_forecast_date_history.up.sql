-- Histórico de datas.
--
-- As datas do forecast mudam toda quarta e sexta, conforme o portal do cliente
-- é reexportado. Até aqui só o valor atual existia: para saber que a data de uma
-- obra andou três vezes, e por quê, era preciso garimpar payload de audit_logs.
--
-- Cada mudança vira uma linha, com a origem. Origem importa: data que veio de
-- Orders ou de e-mail vale mais que data do Job Schedule, e data posta à mão
-- não pode ser sobrescrita por automação (PROCESSO_ATUALIZACAO.md, seção 5).
CREATE TABLE IF NOT EXISTS forecast_date_history (
    id         BIGSERIAL   PRIMARY KEY,
    project_id TEXT        NOT NULL,
    company    TEXT        NOT NULL DEFAULT '',
    field      TEXT        NOT NULL,
    old_value  DATE,
    new_value  DATE,
    -- 'orders' | 'email' | 'schedule' | 'manual' | 'import'
    source     TEXT        NOT NULL DEFAULT 'manual',
    changed_by TEXT        NOT NULL DEFAULT '',
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_date_history_project
    ON forecast_date_history (LOWER(project_id), changed_at DESC, id DESC);

-- Quem escreve a data diz de onde ela veio, por variável de sessão. Sem isso,
-- toda alteração seria "manual" e o histórico perderia justamente a informação
-- que o torna útil:
--
--   SET LOCAL bor.date_source = 'orders';
--   SET LOCAL bor.changed_by  = 'Vitor';
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
    FOREACH field IN ARRAY ARRAY['previous_beams_date', 'previous_start_date',
                                 'previous_end_date', 'hvac_rough_date',
                                 'hvac_air_handler_date', 'hvac_condenser_date',
                                 'hvac_finish_date']
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

DROP TRIGGER IF EXISTS forecast_core_track_dates_trg ON forecast_core;
CREATE TRIGGER forecast_core_track_dates_trg
    AFTER UPDATE ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_track_dates();

-- Na criação da obra as datas nascem preenchidas; sem isso o histórico começaria
-- com um buraco e a primeira alteração pareceria vinda do nada.
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
    FOREACH field IN ARRAY ARRAY['previous_beams_date', 'previous_start_date',
                                 'previous_end_date', 'hvac_rough_date',
                                 'hvac_air_handler_date', 'hvac_condenser_date',
                                 'hvac_finish_date']
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

DROP TRIGGER IF EXISTS forecast_core_track_dates_insert_trg ON forecast_core;
CREATE TRIGGER forecast_core_track_dates_insert_trg
    AFTER INSERT ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_track_dates_insert();
