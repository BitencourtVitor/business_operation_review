-- Categoria e subcategoria viram etiqueta, e a pasta deixa de ser o lugar onde
-- o documento mora.
--
-- Até aqui a pasta *era* o documento: a taxonomia criava uma linha vazia em
-- `atlas_document` por categoria e valor de eixo ("3rd Floor Trusses"), e o PDF
-- era anexado dentro dela. Isso amarrava três coisas que não são a mesma: o que
-- a obra precisa ter, como o documento se classifica, e como o arquivo se
-- chama.
--
-- Depois desta migração:
--   * o que a obra precisa ter mora em `atlas_jobsite_category`;
--   * como o documento se classifica mora em `atlas_document_tag`, e são
--     muitas por documento: um set de painéis do 3º e do 4º andar não precisa
--     mais ser dois documentos;
--   * o nome do documento vem do PDF anexado, e é editável.

-- ── A etiqueta ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_document_tag (
    document_id TEXT        NOT NULL REFERENCES atlas_document(id) ON DELETE CASCADE,
    category_id BIGINT      NOT NULL REFERENCES atlas_doc_category(id) ON DELETE CASCADE,
    -- O valor do eixo: o andar ("3rd"), a letra da unidade ("C"), ou vazio
    -- quando a categoria não se divide.
    subcategory TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, category_id, subcategory)
);

CREATE INDEX IF NOT EXISTS atlas_document_tag_category_idx
    ON atlas_document_tag (category_id, subcategory);

-- ── O que a obra espera receber ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_jobsite_category (
    jobsite_id  TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    category_id BIGINT      NOT NULL REFERENCES atlas_doc_category(id) ON DELETE CASCADE,
    subcategory TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (jobsite_id, category_id, subcategory)
);

-- ── O que já existe passa para o modelo novo ────────────────────────────────
INSERT INTO atlas_document_tag (document_id, category_id, subcategory)
SELECT id, category_id, subcategory
FROM atlas_document
WHERE category_id IS NOT NULL AND archived_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO atlas_jobsite_category (jobsite_id, category_id, subcategory)
SELECT DISTINCT jobsite_id, category_id, subcategory
FROM atlas_document
WHERE category_id IS NOT NULL AND archived_at IS NULL
ON CONFLICT DO NOTHING;

-- A vaga que nunca recebeu arquivo não é documento: ela virou linha em
-- `atlas_jobsite_category` logo acima, e continuar aparecendo na lista de
-- documentos a faria ser contada duas vezes. Arquiva, não apaga: se algo aqui
-- estiver errado, a linha continua no banco.
UPDATE atlas_document d
SET archived_at = now(), updated_at = now()
WHERE d.archived_at IS NULL
  AND d.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_document_version v WHERE v.document_id = d.id);

-- Dois documentos da mesma categoria na mesma obra passam a ser normais: são
-- dois arquivos, com nomes próprios, e a categoria é etiqueta dos dois.
DROP INDEX IF EXISTS atlas_document_slot_uniq;
