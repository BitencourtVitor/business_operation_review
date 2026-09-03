-- Volta a pasta a ser o documento.
--
-- As vagas vazias que a subida arquivou voltam a valer, e com elas o índice que
-- proibia duas pastas iguais na mesma obra. Documento com mais de uma etiqueta
-- perde as demais: o modelo antigo só tem lugar para uma.
UPDATE atlas_document d
SET archived_at = NULL, updated_at = now()
WHERE d.archived_at IS NOT NULL
  AND d.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_document_version v WHERE v.document_id = d.id);

UPDATE atlas_document d
SET category_id = t.category_id, subcategory = t.subcategory
FROM (
    SELECT DISTINCT ON (document_id) document_id, category_id, subcategory
    FROM atlas_document_tag ORDER BY document_id, created_at
) t
WHERE t.document_id = d.id AND d.category_id IS NULL;

DROP TABLE IF EXISTS atlas_document_tag;
DROP TABLE IF EXISTS atlas_jobsite_category;

CREATE UNIQUE INDEX IF NOT EXISTS atlas_document_slot_uniq
    ON atlas_document (jobsite_id, category, subcategory)
    WHERE archived_at IS NULL;
