-- Obra da HVAC não tem estrutura de Framing.
--
-- O que as duas empresas partilham são as flags da obra — QB Time, has_orders,
-- o vínculo entre empresas no mesmo endereço. Estrutura não se partilha:
-- Fieldwire, Machines e Contract steps são da Framing; Permit é da HVAC.
--
-- O `Create` do repositório já respeitava isso; o `Update` não, e bastava
-- alguém salvar um campo no Data Control para o catálogo inteiro de Fieldwire e
-- Machines ser semeado numa obra de HVAC. O guarda no Go foi corrigido, mas ele
-- só cobre quem passa pela API: o carregador do repo Data Att Forecast escreve
-- direto no banco. Aqui a regra vale para qualquer caminho de escrita.

-- ── Limpeza ─────────────────────────────────────────────────────────────────
-- 23 linhas em 2 obras na data desta migração, nenhuma com status marcado.
DELETE FROM forecast_fieldwire f
USING forecast_core c WHERE LOWER(c.id) = LOWER(f.project_id) AND LOWER(c.company) = 'hvac';

DELETE FROM forecast_machines m
USING forecast_core c WHERE LOWER(c.id) = LOWER(m.project_id) AND LOWER(c.company) = 'hvac';

DELETE FROM forecast_contract_steps s
USING forecast_core c WHERE LOWER(c.id) = LOWER(s.project_id) AND LOWER(c.company) = 'hvac';

-- ── Trava ───────────────────────────────────────────────────────────────────
-- Descarta a linha em vez de levantar erro: quem semeia isso são cargas em lote
-- e o seed do catálogo, e derrubar a carga inteira por causa de uma linha que
-- não deveria existir troca um problema pequeno por um grande. A linha some, o
-- resto passa.
CREATE OR REPLACE FUNCTION forecast_bloqueia_estrutura_framing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM forecast_core c
        WHERE LOWER(c.id) = LOWER(NEW.project_id) AND LOWER(c.company) = 'hvac'
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecast_fieldwire_sem_hvac ON forecast_fieldwire;
CREATE TRIGGER forecast_fieldwire_sem_hvac
    BEFORE INSERT ON forecast_fieldwire
    FOR EACH ROW EXECUTE FUNCTION forecast_bloqueia_estrutura_framing();

DROP TRIGGER IF EXISTS forecast_machines_sem_hvac ON forecast_machines;
CREATE TRIGGER forecast_machines_sem_hvac
    BEFORE INSERT ON forecast_machines
    FOR EACH ROW EXECUTE FUNCTION forecast_bloqueia_estrutura_framing();

DROP TRIGGER IF EXISTS forecast_contract_steps_sem_hvac ON forecast_contract_steps;
CREATE TRIGGER forecast_contract_steps_sem_hvac
    BEFORE INSERT ON forecast_contract_steps
    FOR EACH ROW EXECUTE FUNCTION forecast_bloqueia_estrutura_framing();

-- O espelho da regra: Permit é da HVAC e não entra em obra da Framing. A
-- 000122 semeia por trigger só quando company='hvac', mas nada impedia um
-- INSERT à mão do outro lado.
CREATE OR REPLACE FUNCTION forecast_bloqueia_permit_framing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM forecast_core c
        WHERE LOWER(c.id) = LOWER(NEW.project_id) AND LOWER(c.company) <> 'hvac'
    ) THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecast_permit_so_hvac ON forecast_permit;
CREATE TRIGGER forecast_permit_so_hvac
    BEFORE INSERT ON forecast_permit
    FOR EACH ROW EXECUTE FUNCTION forecast_bloqueia_permit_framing();
