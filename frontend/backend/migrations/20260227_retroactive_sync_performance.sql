-- Script para sincronizar obras retroativamente com a tabela subcontractor_performance
-- Objetivo: Garantir que obras 'open' e 'closed' tenham seus eventos registrados

DO $$
DECLARE
    rec RECORD;
    team_rec RECORD;
    has_teams BOOLEAN;
BEGIN
    -- 1. PROCESSAR OBRAS 'OPEN' (Evento Start)
    FOR rec IN 
        SELECT id, previous_start_date 
        FROM public.forecast_data 
        WHERE LOWER(status) = 'open'
        AND NOT EXISTS (
            SELECT 1 FROM public.subcontractor_performance 
            WHERE obra_id = public.forecast_data.id AND estimated_date_type = 'Start'
        )
    LOOP
        has_teams := FALSE;
        FOR team_rec IN SELECT DISTINCT team FROM public.forecast_contract_steps WHERE obra_id = rec.id AND team IS NOT NULL LOOP
            has_teams := TRUE;
            INSERT INTO public.subcontractor_performance (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
            VALUES (rec.id, 'not started -> open', 'Start', team_rec.team, COALESCE(rec.previous_start_date::timestamp with time zone, NOW()), 'system_sync@premium.com')
            ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
        END LOOP;
        
        IF NOT has_teams THEN
            INSERT INTO public.subcontractor_performance (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
            VALUES (rec.id, 'not started -> open', 'Start', NULL, COALESCE(rec.previous_start_date::timestamp with time zone, NOW()), 'system_sync@premium.com')
            ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
        END IF;
    END LOOP;

    -- 2. PROCESSAR OBRAS 'CLOSED' (Eventos Start e End)
    FOR rec IN 
        SELECT id, previous_start_date, previous_end_date 
        FROM public.forecast_data 
        WHERE LOWER(status) = 'closed'
    LOOP
        -- Garantir evento START para obras fechadas
        IF NOT EXISTS (SELECT 1 FROM public.subcontractor_performance WHERE obra_id = rec.id AND estimated_date_type = 'Start') THEN
            has_teams := FALSE;
            FOR team_rec IN SELECT DISTINCT team FROM public.forecast_contract_steps WHERE obra_id = rec.id AND team IS NOT NULL LOOP
                has_teams := TRUE;
                INSERT INTO public.subcontractor_performance (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
                VALUES (rec.id, 'not started -> open', 'Start', team_rec.team, COALESCE(rec.previous_start_date::timestamp with time zone, NOW()), 'system_sync@premium.com')
                ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
            END LOOP;
            IF NOT has_teams THEN
                INSERT INTO public.subcontractor_performance (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
                VALUES (rec.id, 'not started -> open', 'Start', NULL, COALESCE(rec.previous_start_date::timestamp with time zone, NOW()), 'system_sync@premium.com')
                ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
            END IF;
        END IF;

        -- Garantir evento END para obras fechadas
        IF NOT EXISTS (SELECT 1 FROM public.subcontractor_performance WHERE obra_id = rec.id AND estimated_date_type = 'End') THEN
            has_teams := FALSE;
            FOR team_rec IN SELECT DISTINCT team FROM public.forecast_contract_steps WHERE obra_id = rec.id AND team IS NOT NULL LOOP
                has_teams := TRUE;
                INSERT INTO public.subcontractor_performance (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
                VALUES (rec.id, 'open -> closed', 'End', team_rec.team, COALESCE(rec.previous_end_date::timestamp with time zone, NOW()), 'system_sync@premium.com')
                ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
            END LOOP;
            IF NOT has_teams THEN
                INSERT INTO public.subcontractor_performance (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
                VALUES (rec.id, 'open -> closed', 'End', NULL, COALESCE(rec.previous_end_date::timestamp with time zone, NOW()), 'system_sync@premium.com')
                ON CONFLICT (obra_id, event, event_datetime) DO NOTHING;
            END IF;
        END IF;
    END LOOP;
END $$;
