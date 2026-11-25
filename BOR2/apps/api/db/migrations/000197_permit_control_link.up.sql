-- O Permit Control passa a ser a fonte do permit das obras da HVAC (23/11/2026).
-- A lista completa de obras é a do HVAC Schedule; cada obra pode ser vinculada a
-- uma linha do Permit Control, e uma linha só serve a uma obra.
ALTER TABLE permit_control
    ADD COLUMN project_id TEXT UNIQUE REFERENCES forecast_core(id) ON DELETE SET NULL;

-- As datas da linha vinculada marcam as etapas da obra: Request = Manual J,
-- Application = Application Submitted, Issue = Permit Approved. No banco para
-- valer em qualquer caminho de escrita. Desvincular não mexe nas etapas.
CREATE OR REPLACE FUNCTION permit_control_sync_steps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.project_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE forecast_permit pm
       SET status = CASE
               WHEN pm.step = 'Manual J'              AND NEW.solicitacao IS NOT NULL THEN 'completed'
               WHEN pm.step = 'Application Submitted' AND NEW.aplicacao   IS NOT NULL THEN 'completed'
               WHEN pm.step = 'Permit Approved'       AND NEW.emissao     IS NOT NULL THEN 'completed'
           END,
           updated_at = NOW()
     WHERE LOWER(pm.project_id) = LOWER(NEW.project_id)
       AND pm.step IN ('Manual J', 'Application Submitted', 'Permit Approved');

    RETURN NULL;
END;
$$;

CREATE TRIGGER permit_control_sync_steps_trg
    AFTER INSERT OR UPDATE OF project_id, solicitacao, aplicacao, emissao ON permit_control
    FOR EACH ROW
    EXECUTE FUNCTION permit_control_sync_steps();
