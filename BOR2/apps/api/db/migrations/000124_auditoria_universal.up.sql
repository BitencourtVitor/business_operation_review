-- Auditoria de linha, em todas as tabelas.
--
-- O que existia até aqui não cumpria a regra: `audit_logs` é log de requisição
-- HTTP — guarda rota, método e status, não guarda o valor anterior. Dos 5.159
-- registros, 1 tinha qualquer coisa parecida com "antes". E ele só enxerga o
-- que passa pela API: carregador em Python, script e SQL na mão escrevem por
-- fora. Das 146 tabelas, exatamente 1 tinha trigger de histórico, e só para
-- datas.
--
-- O caso que expôs isso: Willis Brook Lot 64 com os 8 documentos de Fieldwire
-- marcados como concluídos e nenhum responsável registrado em nenhum deles.
--
-- Aqui a auditoria passa a ser do banco, não da aplicação: qualquer caminho de
-- escrita é pego, porque o trigger é do dado e não da rota.

CREATE TABLE IF NOT EXISTS audit_row_history (
    id             BIGSERIAL   PRIMARY KEY,
    table_name     TEXT        NOT NULL,
    -- A chave primária como objeto, para dar conta das 18 tabelas com chave
    -- composta sem inventar uma coluna que não existe.
    row_pk         JSONB       NOT NULL,
    operation      TEXT        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    old_row        JSONB,
    new_row        JSONB,
    -- Só o que mudou. Ler 40 colunas para achar a que mexeu é o que faz um
    -- histórico existir e ninguém consultar.
    changed_fields TEXT[],
    actor_id       TEXT        NOT NULL DEFAULT '',
    actor_name     TEXT        NOT NULL DEFAULT '',
    -- api | script | migration | sync | unknown
    source         TEXT        NOT NULL DEFAULT 'unknown',
    changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_row_history_tabela
    ON audit_row_history (table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_row_history_pk
    ON audit_row_history USING GIN (row_pk);
CREATE INDEX IF NOT EXISTS idx_audit_row_history_quando
    ON audit_row_history (changed_at DESC);

-- Quem está escrevendo. Vem por variável de sessão, o mesmo mecanismo que o
-- forecast_date_history já usa:
--
--   SELECT set_config('bor.actor_name', 'Vitor Bitencourt', true);
--   SELECT set_config('bor.source', 'api', true);
--
-- Sem ninguém informar, fica 'unknown' — que é uma resposta honesta e, o mais
-- importante, é uma resposta *visível*: dá para medir quanto do sistema ainda
-- escreve sem se identificar.
CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    pk_cols  TEXT[] := TG_ARGV;
    pk       JSONB  := '{}'::jsonb;
    col      TEXT;
    old_j    JSONB;
    new_j    JSONB;
    mudou    TEXT[];
BEGIN
    IF TG_OP <> 'INSERT' THEN old_j := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN new_j := to_jsonb(NEW); END IF;

    -- UPDATE que não mudou nada não é fato: gravar isso enche o histórico de
    -- linhas idênticas e esconde as que importam.
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(key) INTO mudou
        FROM jsonb_each(new_j)
        WHERE value IS DISTINCT FROM old_j -> key;
        IF mudou IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    FOREACH col IN ARRAY pk_cols LOOP
        pk := pk || jsonb_build_object(col, COALESCE(new_j, old_j) -> col);
    END LOOP;

    INSERT INTO audit_row_history
        (table_name, row_pk, operation, old_row, new_row, changed_fields,
         actor_id, actor_name, source)
    VALUES (
        TG_TABLE_NAME, pk, TG_OP, old_j, new_j, mudou,
        COALESCE(NULLIF(current_setting('bor.actor_id',   true), ''), ''),
        COALESCE(NULLIF(current_setting('bor.actor_name', true), ''),
                 NULLIF(current_setting('bor.changed_by', true), ''), ''),
        COALESCE(NULLIF(current_setting('bor.source',     true), ''), 'unknown')
    );
    RETURN NULL;
END;
$$;

-- ── Instalação em toda tabela ───────────────────────────────────────────────
-- Tabelas que são elas próprias trilha de auditoria só registram UPDATE e
-- DELETE: o INSERT delas já é o registro de outra coisa, e auditar o registro
-- do registro dobra o volume sem dizer nada novo. O que importa nelas é
-- adulteração — alguém reescrevendo ou apagando histórico.
CREATE OR REPLACE FUNCTION audit_instalar(alvo TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    pk_cols  TEXT;
    eventos  TEXT;
BEGIN
    IF alvo IN ('audit_row_history') THEN
        RETURN;
    END IF;

    SELECT string_agg(quote_literal(a.attname), ', ' ORDER BY k.ord)
      INTO pk_cols
    FROM pg_constraint c
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'p' AND c.conrelid = (quote_ident(alvo))::regclass;

    -- Sem chave primária não há como apontar a linha. Hoje não existe nenhuma
    -- assim; se surgir, fica de fora e aparece no relatório de cobertura.
    IF pk_cols IS NULL THEN
        RETURN;
    END IF;

    eventos := CASE
        WHEN alvo ~ '(_history|_log|_logs)$' THEN 'UPDATE OR DELETE'
        ELSE 'INSERT OR UPDATE OR DELETE'
    END;

    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit ON %I', alvo);
    EXECUTE format(
        'CREATE TRIGGER zz_audit AFTER %s ON %I FOR EACH ROW EXECUTE FUNCTION audit_row_change(%s)',
        eventos, alvo, pk_cols);
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        PERFORM audit_instalar(t);
    END LOOP;
END;
$$;

-- ── Tabela nova nasce auditada ──────────────────────────────────────────────
-- Sem isto, a cobertura é de hoje: a próxima migração cria uma tabela e ela
-- entra sem auditoria, e ninguém percebe até alguém perguntar "quem mudou
-- isso?" — que é exatamente como este problema apareceu.
CREATE OR REPLACE FUNCTION audit_instalar_em_tabela_nova()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE obj RECORD;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    LOOP
        IF obj.command_tag = 'CREATE TABLE' AND obj.schema_name = 'public' THEN
            PERFORM audit_instalar(split_part(obj.object_identity, '.', 2));
        END IF;
    END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS audit_tabela_nova;
CREATE EVENT TRIGGER audit_tabela_nova
    ON ddl_command_end WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION audit_instalar_em_tabela_nova();

-- ── Cobertura, consultável ──────────────────────────────────────────────────
-- Para a pergunta "está tudo auditado?" ter resposta por consulta, e não por
-- confiança.
CREATE OR REPLACE VIEW audit_cobertura AS
SELECT t.table_name,
       (tg.tgname IS NOT NULL) AS auditada,
       COALESCE(s.n_live_tup, 0) AS linhas
FROM information_schema.tables t
LEFT JOIN pg_trigger tg
       ON tg.tgrelid = (quote_ident(t.table_name))::regclass
      AND tg.tgname = 'zz_audit'
LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY auditada, t.table_name;
