-- O escopo também carrega o nome da categoria da pasta.
--
-- Um escopo de subcategoria junta pastas de categorias diferentes: o primeiro
-- andar de um prédio tem Wall Panels, Floor Layout e Trusses, e a verificação
-- daquele andar percorre os três. Isso é o que se quer, e criava uma pergunta
-- sem resposta na tela: o cartão dizia "1st Floor, 2 folders" e não dizia de
-- quais categorias, então saber o que ia ser percorrido exigia abrir.
--
-- Com o nome da categoria no escopo, a listagem pode dizer quais são, que é a
-- informação que a contagem sozinha escondia.
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
       ) AS scope_value,
       CASE WHEN COALESCE(NULLIF(tp.subcategory,''), NULLIF(d.subcategory,''), '') <> ''
            THEN COALESCE(tp.axis, '') ELSE '' END AS scope_axis,
       -- A categoria desta pasta, com a mesma queda para as colunas antigas e
       -- para o nome da pasta que o escopo usa.
       COALESCE(
           NULLIF(tp.category_name, ''),
           NULLIF(d.category, ''),
           d.name
       ) AS category_name
  FROM atlas_document d
  LEFT JOIN LATERAL (
      SELECT t.subcategory, c.name AS category_name, c.axis
        FROM atlas_document_tag t
        JOIN atlas_doc_category c ON c.id = t.category_id
       WHERE t.document_id = d.id
       ORDER BY c.position, c.name, t.subcategory
       LIMIT 1
  ) tp ON true;
