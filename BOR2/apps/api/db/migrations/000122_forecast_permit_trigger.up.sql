-- Abastecimento automático das etapas de Permit.
--
-- A 000120 semeou as obras que existiam, e o repositório Go semeia o que passa
-- pelo Data Control. Falta o caminho que mais cria obra de HVAC: o carregador
-- do repo Data Att Forecast, que faz INSERT direto em forecast_core e nunca
-- toca na API. Obra nascida ali ficaria sem etapa nenhuma — e sem etapa não há
-- pendência, então o alerta de Permit passaria batido justamente nas obras
-- recém-importadas, que são as que ainda não têm alvará.
--
-- Mesma decisão da 000115: resolver no banco vale para qualquer caminho de
-- escrita — API, script Python ou SQL na mão.
CREATE OR REPLACE FUNCTION forecast_core_seed_permit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF LOWER(COALESCE(NEW.company, '')) <> 'hvac' THEN
        RETURN NULL;
    END IF;

    INSERT INTO forecast_permit (project_id, step, status, position)
    SELECT NEW.id, s.step, NULL, s.position
    FROM (VALUES
        ('Manual J', 1),
        ('Application Submitted', 2),
        ('Permit Approved', 3)
    ) AS s(step, position)
    ON CONFLICT (project_id, step) DO NOTHING;

    RETURN NULL;
END;
$$;

-- AFTER, e não BEFORE: a linha de forecast_core precisa existir antes de a
-- etapa apontar para ela. UPDATE OF company cobre a obra que troca de empresa.
DROP TRIGGER IF EXISTS forecast_core_seed_permit_trg ON forecast_core;
CREATE TRIGGER forecast_core_seed_permit_trg
    AFTER INSERT OR UPDATE OF company ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_seed_permit();

-- Obra apagada leva as etapas junto. A 000120 não pôs FK porque
-- forecast_core.id é TEXT e a tabela vem da migração do BOR1; sem isso, apagar
-- uma obra deixaria três órfãs para sempre.
DELETE FROM forecast_permit p
WHERE NOT EXISTS (SELECT 1 FROM forecast_core c WHERE c.id = p.project_id);

ALTER TABLE forecast_permit
    DROP CONSTRAINT IF EXISTS forecast_permit_project_fk;
ALTER TABLE forecast_permit
    ADD CONSTRAINT forecast_permit_project_fk
    FOREIGN KEY (project_id) REFERENCES forecast_core(id) ON DELETE CASCADE;
