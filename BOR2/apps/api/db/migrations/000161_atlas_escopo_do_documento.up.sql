-- De onde sai o escopo de um punch, agora que a pasta tem mais de uma categoria.
--
-- A migração anterior leu o escopo de `atlas_document.category` e
-- `atlas_document.subcategory`. Essas colunas continuam existindo e já não são a
-- verdade: desde a migração 000144 a pasta declara suas categorias em
-- `atlas_document_tag`, uma linha por vaga, e é lá que está o que a tela mostra.
-- O acervo tem as duas formas convivendo, pasta antiga com a coluna preenchida e
-- tag vazia, pasta nova com tag preenchida e coluna vazia, então ler só uma
-- delas deixa metade das pastas fora do punch.
--
-- A view resolve isso num lugar só. Quem precisa do escopo de uma pasta pergunta
-- a ela, e não repete a regra em cada consulta, que é como as duas metades
-- divergem na primeira mudança.
--
-- ── A ordem de preferência, e por que ela termina no nome da pasta ──
--
--   1. A subcategoria da primeira tag. É o pavimento ou a unidade: 1st floor,
--      C unit. Primeira pela posição da categoria na taxonomia, que é a mesma
--      regra que o gabarito de nomenclatura usa: a pasta pode ocupar várias
--      vagas, e a primeira é a que manda.
--   2. O nome da categoria da primeira tag, quando ela não tem eixo. Permit Set,
--      Details e Island Dimensions são assim: não têm pavimento nem unidade para
--      preencher, e é por isso que o punch de Permit Set não existia.
--   3. As colunas antigas, nessa ordem, para a pasta que ainda não tem tag.
--   4. O nome da pasta, como último recurso.
--
-- O item 4 existe para nenhuma pasta cair fora. Sem ele, pasta sem tag e sem
-- coluna produz escopo vazio, e escopo vazio na tela é um bloco em branco que
-- ninguém sabe o que é.

CREATE OR REPLACE VIEW atlas_documento_escopo AS
SELECT d.id         AS document_id,
       d.jobsite_id AS jobsite_id,
       CASE WHEN COALESCE(NULLIF(tp.subcategory,''), NULLIF(d.subcategory,''), '') <> ''
            THEN 'subcategory' ELSE 'category' END AS scope_kind,
       COALESCE(
           NULLIF(tp.subcategory, ''),
           NULLIF(d.subcategory, ''),
           NULLIF(tp.category_name, ''),
           NULLIF(d.category, ''),
           d.name
       ) AS scope_value
  FROM atlas_document d
  LEFT JOIN LATERAL (
      SELECT t.subcategory, c.name AS category_name
        FROM atlas_document_tag t
        JOIN atlas_doc_category c ON c.id = t.category_id
       WHERE t.document_id = d.id
       ORDER BY c.position, c.name, t.subcategory
       LIMIT 1
  ) tp ON true;

COMMENT ON VIEW atlas_documento_escopo IS
    'O escopo de punch de cada pasta: subcategoria quando ela declara pavimento '
    'ou unidade, senão a categoria, e o nome da pasta como último recurso.';

-- O acervo entra de novo, agora pelo escopo certo.
--
-- Só as passagens que a migração anterior criou sozinha são refeitas, e elas se
-- reconhecem por não terem dono nem apelido nem observação. Passagem aberta por
-- gente fica como está.
DELETE FROM atlas_punch
 WHERE opened_by = '' AND name = '' AND notes = '' AND closed_at IS NULL;

INSERT INTO atlas_punch (id, jobsite_id, scope_kind, scope_value, opened_at, opened_by, name)
SELECT gen_random_uuid()::text, x.jobsite_id, x.scope_kind, x.scope_value, x.desde, '', ''
  FROM (
    SELECT e.jobsite_id, esc.scope_kind, esc.scope_value, min(e.created_at) AS desde
      FROM atlas_event e
      JOIN atlas_sheet s                ON s.id = e.sheet_id
      JOIN atlas_document_version v     ON v.id = s.version_id
      JOIN atlas_documento_escopo esc   ON esc.document_id = v.document_id
     GROUP BY 1, 2, 3
  ) x
 WHERE NOT EXISTS (
    SELECT 1 FROM atlas_punch p
     WHERE p.jobsite_id = x.jobsite_id AND p.scope_kind = x.scope_kind
       AND p.scope_value = x.scope_value AND p.closed_at IS NULL
 );

UPDATE atlas_event e
   SET punch_id = p.id
  FROM atlas_sheet s, atlas_document_version v, atlas_documento_escopo esc, atlas_punch p
 WHERE s.id = e.sheet_id
   AND v.id = s.version_id
   AND esc.document_id = v.document_id
   AND p.jobsite_id = e.jobsite_id
   AND p.closed_at IS NULL
   AND p.scope_kind = esc.scope_kind
   AND p.scope_value = esc.scope_value
   AND e.punch_id IS DISTINCT FROM p.id;
