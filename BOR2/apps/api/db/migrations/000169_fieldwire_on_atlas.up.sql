-- "On Atlas": a obra já está no Atlas. Vale para toda obra da Framing, mas não
-- entra em nota nenhuma (OFI, readiness, progresso do card): obra que ainda não
-- subiu não pode derrubar a nota do mês. Quem diz isso é o catálogo, e não o
-- nome do documento espalhado pelo código.
ALTER TABLE catalog_forecast_fieldwire
    ADD COLUMN IF NOT EXISTS counts_in_score BOOLEAN NOT NULL DEFAULT true;

INSERT INTO catalog_forecast_fieldwire (id, client, type, document, where_location, notes, created_at, counts_in_score)
SELECT COALESCE(MAX(id), 0) + 1, '', '', 'On Atlas', 'Atlas', 'Não conta no OFI.', NOW(), false
FROM catalog_forecast_fieldwire
WHERE NOT EXISTS (SELECT 1 FROM catalog_forecast_fieldwire WHERE document = 'On Atlas');

-- Retroativo só no que não está fechado, mesma regra do Trusses Plans (16/09).
WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_fieldwire)
INSERT INTO forecast_fieldwire (id, project_id, category, document, status)
SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY fc.id), fc.id, '', 'On Atlas', NULL
FROM forecast_core fc, max_id
WHERE lower(trim(fc.company)) = 'framing'
  AND lower(COALESCE(fc.status, '')) NOT IN ('closed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM forecast_fieldwire ff
    WHERE ff.project_id = fc.id AND lower(trim(ff.document)) = 'on atlas'
  );
