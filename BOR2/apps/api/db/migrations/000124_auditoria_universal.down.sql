DROP EVENT TRIGGER IF EXISTS audit_tabela_nova;
DROP FUNCTION IF EXISTS audit_instalar_em_tabela_nova();
DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables
             WHERE table_schema='public' AND table_type='BASE TABLE'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON %I', t);
    END LOOP;
END;
$$;
DROP VIEW IF EXISTS audit_cobertura;
DROP FUNCTION IF EXISTS audit_instalar(TEXT);
DROP FUNCTION IF EXISTS audit_row_change();
DROP TABLE IF EXISTS audit_row_history;
