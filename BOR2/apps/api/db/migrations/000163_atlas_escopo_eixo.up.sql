-- O escopo passa a dizer de que eixo ele é.
--
-- O valor de uma subcategoria é curto por natureza: "1st", "C". Sozinho na tela
-- ele não diz se é andar ou unidade, e "1st" num cartão de verificação pode ser
-- qualquer coisa. O resto do Atlas já escreve "1st Floor Wall Panels" quando
-- mostra a etiqueta de uma pasta, e a verificação precisa do mesmo para escrever
-- "1st Floor".
--
-- O eixo sai da categoria da primeira tag, que é de onde a subcategoria também
-- saiu. Pasta sem tag, que é a que ainda usa as colunas antigas, fica com o eixo
-- vazio: ali não há de onde tirar, e o rótulo cai no valor cru, que é o que se
-- mostrava antes.
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
            THEN COALESCE(tp.axis, '') ELSE '' END AS scope_axis
  FROM atlas_document d
  LEFT JOIN LATERAL (
      SELECT t.subcategory, c.name AS category_name, c.axis
        FROM atlas_document_tag t
        JOIN atlas_doc_category c ON c.id = t.category_id
       WHERE t.document_id = d.id
       ORDER BY c.position, c.name, t.subcategory
       LIMIT 1
  ) tp ON true;

COMMENT ON VIEW atlas_documento_escopo IS
    'O escopo de punch de cada pasta: subcategoria quando ela declara pavimento '
    'ou unidade, senão a categoria, e o nome da pasta como último recurso. '
    'scope_axis diz se a subcategoria é andar (floor) ou unidade (unit).';
