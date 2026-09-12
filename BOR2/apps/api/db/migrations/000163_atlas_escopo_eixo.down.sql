-- Volta a view sem o eixo.
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
