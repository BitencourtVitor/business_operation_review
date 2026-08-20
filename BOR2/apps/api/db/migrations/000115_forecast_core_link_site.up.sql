-- Vínculo automático da obra no cadastro.
--
-- O backfill da 000113 ligou o que já existia, e o carregador do repo
-- Data Att Forecast liga o que vem do portal. Faltava o caso do dia a dia: obra
-- criada ou editada pelo Data Control. Sem isso, ela nasceria sem site_id e sem
-- selo, e só apareceria vinculada na próxima carga semanal.
--
-- Resolver isso no banco, e não no handler, mantém o vínculo verdadeiro para
-- qualquer caminho de escrita — API, script ou SQL na mão.
CREATE OR REPLACE FUNCTION forecast_core_link_site()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    addr_key TEXT;
    lot_key  TEXT;
    found_id UUID;
BEGIN
    addr_key := forecast_address_key(NEW.address);
    lot_key  := forecast_lot_key(NEW.lote_bld);

    -- Obra sem endereço não tem como ser identificada; fica sem vínculo.
    IF addr_key = '' THEN
        RETURN NEW;
    END IF;

    SELECT id INTO found_id
    FROM forecast_sites
    WHERE address_key = addr_key AND lote_key = lot_key;

    -- Endereço divergente do portal acontece (placeholder, comunidade escrita
    -- no lugar da rua), então job_site + lote é a segunda chance antes de criar
    -- uma obra duplicada.
    IF found_id IS NULL AND COALESCE(TRIM(NEW.job_site), '') <> '' THEN
        SELECT id INTO found_id
        FROM forecast_sites
        WHERE LOWER(job_site) = LOWER(NEW.job_site) AND lote_key = lot_key
        ORDER BY created_at
        LIMIT 1;
    END IF;

    IF found_id IS NULL THEN
        INSERT INTO forecast_sites
            (address_key, lote_key, address, cliente, job_site, lote_bld, type)
        VALUES
            (addr_key, lot_key, COALESCE(NEW.address, ''), COALESCE(NEW.cliente, ''),
             COALESCE(NEW.job_site, ''), COALESCE(NEW.lote_bld, ''), COALESCE(NEW.type, ''))
        ON CONFLICT (address_key, lote_key) DO NOTHING
        RETURNING id INTO found_id;

        IF found_id IS NULL THEN
            SELECT id INTO found_id
            FROM forecast_sites
            WHERE address_key = addr_key AND lote_key = lot_key;
        END IF;
    END IF;

    NEW.site_id := found_id;

    INSERT INTO forecast_site_companies (site_id, company, source)
    VALUES (found_id, COALESCE(NULLIF(TRIM(NEW.company), ''), 'framing'), 'forecast')
    ON CONFLICT (site_id, company) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecast_core_link_site_trg ON forecast_core;
CREATE TRIGGER forecast_core_link_site_trg
    BEFORE INSERT OR UPDATE OF address, lote_bld, job_site, company ON forecast_core
    FOR EACH ROW
    EXECUTE FUNCTION forecast_core_link_site();
