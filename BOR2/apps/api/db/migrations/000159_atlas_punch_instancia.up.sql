-- O punch deixa de ser uma consulta e passa a ser uma coisa.
--
-- Até aqui "punch list do primeiro andar" era um filtro: pegava-se todo ponto da
-- obra e escondia-se o que não fosse daquele pavimento. Funciona para olhar, e
-- não serve para conduzir. Filtro não tem data de início, não tem responsável,
-- não fecha, e principalmente não se repete: percorrer o mesmo andar em março e
-- de novo em junho produzia um monte só, sem como dizer o que era de cada
-- passagem.
--
-- Agora cada passagem é uma linha. Ela tem identidade, tem quando começou, tem
-- quem abriu, e tem fechamento. O ponto continua sendo o que sempre foi, uma
-- linha de `atlas_event` ancorada na folha, e ganha o vínculo com a passagem em
-- que nasceu.
--
-- ── O escopo, e por que ele tem dois formatos ──
--
-- A unidade de escopo é a subcategoria, que na prática é o andar ou a unidade:
-- 1st floor, C unit. Ela mora no documento, e é por isso que a consulta precisa
-- subir de folha para versão e de versão para documento.
--
-- Só que nem toda pasta tem subcategoria. A taxonomia declara um eixo por
-- categoria, e há categoria com eixo nenhum: Permit Set é o caso, e Details e
-- Island Dimensions também. Essas pastas não têm pavimento nem unidade para
-- preencher, e a consulta antiga as descartava com um `HAVING subcategory <> ''`.
-- O resultado é que o Permit Set, que é onde mais se levanta pendência, nunca
-- apareceu como escopo possível de punch.
--
-- Daí o escopo carregar o formato junto do valor. `subcategory` quando a pasta
-- declara um pavimento; `category` quando ela não tem eixo, e aí quem dá nome ao
-- punch é a própria categoria. É o fallback pedido, escrito de forma que a
-- consulta não precise adivinhar qual dos dois está olhando.

CREATE TABLE IF NOT EXISTS atlas_punch (
    id          TEXT PRIMARY KEY,
    jobsite_id  TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    -- Em que eixo este punch corre. Ver o comentário acima: os dois existem
    -- porque nem toda pasta tem pavimento.
    scope_kind  TEXT        NOT NULL CHECK (scope_kind IN ('subcategory','category')),
    scope_value TEXT        NOT NULL,
    -- O apelido da passagem, quando alguém quiser dar um. Vazio é o normal: o
    -- que identifica é o escopo e a data.
    name        TEXT        NOT NULL DEFAULT '',
    opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_by   TEXT        NOT NULL DEFAULT '',
    closed_at   TIMESTAMPTZ,
    closed_by   TEXT,
    notes       TEXT        NOT NULL DEFAULT ''
);

-- Duas passagens abertas no mesmo escopo seriam duas listas concorrentes do
-- mesmo andar, e ninguém saberia em qual registrar o ponto de hoje. Fechada, a
-- passagem sai da trava e o mesmo escopo pode ser percorrido de novo, que é o
-- caso de março e junho.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_punch_aberto_unico
    ON atlas_punch (jobsite_id, scope_kind, scope_value)
    WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS atlas_punch_jobsite_idx
    ON atlas_punch (jobsite_id, opened_at DESC);

ALTER TABLE atlas_event
    ADD COLUMN IF NOT EXISTS punch_id TEXT REFERENCES atlas_punch(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS atlas_event_punch_idx ON atlas_event (punch_id);

-- ── O acervo entra no modelo novo ──
--
-- Ponto que já existe não pode ficar órfão: ele sumiria da tela no instante em
-- que a tela passasse a perguntar pelo punch. Cada escopo que já tem ponto ganha
-- uma passagem aberta, datada no ponto mais antigo dele, que é a data em que
-- aquela verificação de fato começou.
INSERT INTO atlas_punch (id, jobsite_id, scope_kind, scope_value, opened_at, opened_by, name)
SELECT gen_random_uuid()::text,
       x.jobsite_id,
       x.scope_kind,
       x.scope_value,
       x.desde,
       '',
       ''
  FROM (
    SELECT e.jobsite_id,
           CASE WHEN COALESCE(d.subcategory,'') <> '' THEN 'subcategory' ELSE 'category' END AS scope_kind,
           COALESCE(NULLIF(d.subcategory,''), COALESCE(d.category,'')) AS scope_value,
           min(e.created_at) AS desde
      FROM atlas_event e
      JOIN atlas_sheet s            ON s.id = e.sheet_id
      JOIN atlas_document_version v ON v.id = s.version_id
      JOIN atlas_document d         ON d.id = v.document_id
     GROUP BY 1, 2, 3
  ) x
 WHERE NOT EXISTS (
    SELECT 1 FROM atlas_punch p
     WHERE p.jobsite_id = x.jobsite_id
       AND p.scope_kind = x.scope_kind
       AND p.scope_value = x.scope_value
       AND p.closed_at IS NULL
 );

UPDATE atlas_event e
   SET punch_id = p.id
  FROM atlas_sheet s, atlas_document_version v, atlas_document d, atlas_punch p
 WHERE s.id = e.sheet_id
   AND v.id = s.version_id
   AND d.id = v.document_id
   AND p.jobsite_id = e.jobsite_id
   AND p.closed_at IS NULL
   AND p.scope_kind = CASE WHEN COALESCE(d.subcategory,'') <> '' THEN 'subcategory' ELSE 'category' END
   AND p.scope_value = COALESCE(NULLIF(d.subcategory,''), COALESCE(d.category,''))
   AND e.punch_id IS NULL;

-- ── O fechamento ──
--
-- Fechar uma passagem com ponto pendente dentro é dizer que a verificação
-- terminou quando ela não terminou, e é assim que um relatório de entrega sai
-- afirmando o que não aconteceu. A trava fica no banco pelo mesmo motivo da
-- migração 000156: há mais de um caminho que fecha coisas, e regra guardada em
-- um deles é regra que os outros furam sem querer.
CREATE OR REPLACE FUNCTION atlas_punch_fecha_limpo() RETURNS TRIGGER AS $$
DECLARE
    pendentes INT;
BEGIN
    IF NEW.closed_at IS NULL OR OLD.closed_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO pendentes
      FROM atlas_event e
     WHERE e.punch_id = NEW.id AND e.status <> 'resolved';

    IF pendentes > 0 THEN
        RAISE EXCEPTION 'punch % ainda tem % ponto(s) pendente(s) e não pode ser fechado', NEW.id, pendentes
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_punch_fecha_limpo_trg ON atlas_punch;
CREATE TRIGGER atlas_punch_fecha_limpo_trg
    BEFORE UPDATE ON atlas_punch
    FOR EACH ROW EXECUTE FUNCTION atlas_punch_fecha_limpo();

COMMENT ON TABLE atlas_punch IS
    'Uma passagem de verificação por escopo da obra. Tem identidade, data de '
    'abertura e fechamento; o ponto se pendura nela pelo atlas_event.punch_id.';
COMMENT ON COLUMN atlas_punch.scope_kind IS
    'subcategory quando a pasta declara pavimento ou unidade; category quando a '
    'categoria não tem eixo, como Permit Set.';
