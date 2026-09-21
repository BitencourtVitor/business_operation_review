-- Volta as funções para a forma da migração 000118, sem a nota.
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

ALTER TABLE forecast_date_history DROP COLUMN IF EXISTS note;
