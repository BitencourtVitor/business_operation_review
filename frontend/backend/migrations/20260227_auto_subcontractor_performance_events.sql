-- Function to handle status changes and insert into subcontractor_performance
CREATE OR REPLACE FUNCTION public.handle_subcontractor_performance_status_change()
RETURNS TRIGGER AS $$
DECLARE
    team_record RECORD;
    has_teams BOOLEAN := FALSE;
    user_email_val TEXT;
BEGIN
    -- Obter o email do usuário atual se disponível via Supabase Auth
    BEGIN
        user_email_val := auth.jwt() ->> 'email';
    EXCEPTION WHEN OTHERS THEN
        user_email_val := 'system@premium.com';
    END;

    IF user_email_val IS NULL THEN
        user_email_val := 'system@premium.com';
    END IF;

    -- Caso 1: not started -> open (Início da obra)
    IF (LOWER(OLD.status) = 'not started' OR OLD.status IS NULL) AND LOWER(NEW.status) = 'open' THEN
        -- Buscar todos os times (subempreiteiros) vinculados a esta obra
        FOR team_record IN 
            SELECT DISTINCT team 
            FROM public.forecast_contract_steps 
            WHERE obra_id = NEW.id AND team IS NOT NULL
        LOOP
            has_teams := TRUE;
            INSERT INTO public.subcontractor_performance (
                obra_id,
                event,
                estimated_date_type,
                subcontractor,
                event_datetime,
                user_email
            )
            VALUES (
                NEW.id,
                'not started -> open',
                'Start',
                team_record.team,
                NOW(),
                user_email_val
            )
            ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
        END LOOP;

        -- Se não houver times, insere um registro genérico
        IF NOT has_teams THEN
            INSERT INTO public.subcontractor_performance (
                obra_id,
                event,
                estimated_date_type,
                subcontractor,
                event_datetime,
                user_email
            )
            VALUES (
                NEW.id,
                'not started -> open',
                'Start',
                NULL,
                NOW(),
                user_email_val
            )
            ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
        END IF;
    END IF;

    -- Caso 2: open -> closed (Fim da obra)
    IF LOWER(OLD.status) = 'open' AND LOWER(NEW.status) = 'closed' THEN
        -- Buscar todos os times (subempreiteiros) vinculados a esta obra
        FOR team_record IN 
            SELECT DISTINCT team 
            FROM public.forecast_contract_steps 
            WHERE obra_id = NEW.id AND team IS NOT NULL
        LOOP
            has_teams := TRUE;
            INSERT INTO public.subcontractor_performance (
                obra_id,
                event,
                estimated_date_type,
                subcontractor,
                event_datetime,
                user_email
            )
            VALUES (
                NEW.id,
                'open -> closed',
                'End',
                team_record.team,
                NOW(),
                user_email_val
            )
            ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
        END LOOP;

        -- Se não houver times, insere um registro genérico
        IF NOT has_teams THEN
            INSERT INTO public.subcontractor_performance (
                obra_id,
                event,
                estimated_date_type,
                subcontractor,
                event_datetime,
                user_email
            )
            VALUES (
                NEW.id,
                'open -> closed',
                'End',
                NULL,
                NOW(),
                user_email_val
            )
            ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
        END IF;
    END IF;

    -- Caso 3: Reversão open -> not started (Deleta Start event)
    IF LOWER(OLD.status) = 'open' AND LOWER(NEW.status) = 'not started' THEN
        DELETE FROM public.subcontractor_performance 
        WHERE obra_id = NEW.id AND estimated_date_type = 'Start';
    END IF;

    -- Caso 4: Reversão closed -> open (Deleta End event)
    IF LOWER(OLD.status) = 'closed' AND LOWER(NEW.status) = 'open' THEN
        DELETE FROM public.subcontractor_performance 
        WHERE obra_id = NEW.id AND estimated_date_type = 'End';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on forecast_data
DROP TRIGGER IF EXISTS trigger_subcontractor_performance_status_change ON public.forecast_data;
CREATE TRIGGER trigger_subcontractor_performance_status_change
    AFTER UPDATE ON public.forecast_data
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.handle_subcontractor_performance_status_change();
