-- O Atlas saiu do BOR e virou o BuilderLog, sistema à parte. O Forecast lia
-- sozinho as tabelas atlas_* para saber que categorias de documento a obra da
-- Framing já tinha; agora esse controle é manual, no Data Control, igual ao
-- Fieldwire (F-18). Esta migração cria o catálogo e as linhas por obra e copia
-- o estado de hoje do Atlas, para ninguém recomeçar do zero.

-- O que se espera documentar no BuilderLog, por tipo de obra. "On BuilderLog"
-- diz se a obra já está lá; as outras são as categorias. Option Summary fica de
-- fora: não é pendência da Framing (F-17).
CREATE TABLE IF NOT EXISTS catalog_forecast_builderlog (
    id         SERIAL PRIMARY KEY,
    build_type TEXT NOT NULL CHECK (build_type IN ('house', 'building')),
    document   TEXT NOT NULL,
    position   INT  NOT NULL DEFAULT 0,
    UNIQUE (build_type, document)
);

INSERT INTO catalog_forecast_builderlog (build_type, document, position)
SELECT t.build_type, 'On BuilderLog', 0
  FROM (VALUES ('house'), ('building')) AS t(build_type)
ON CONFLICT DO NOTHING;

INSERT INTO catalog_forecast_builderlog (build_type, document, position)
SELECT c.build_type, c.name, c.position
  FROM atlas_doc_category c
 WHERE c.archived_at IS NULL
   AND c.default_slot
   AND COALESCE(c.client, '') = ''
   AND c.build_type IN ('house', 'building')
   AND lower(c.name) <> 'option summary'
ON CONFLICT DO NOTHING;

-- Uma linha por documento esperado em cada obra da Framing. O status segue o
-- do Fieldwire: 'completed', 'dispensed' ou vazio.
CREATE TABLE IF NOT EXISTS forecast_builderlog (
    id         BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES forecast_core(id) ON DELETE CASCADE,
    document   TEXT NOT NULL,
    position   INT  NOT NULL DEFAULT 0,
    status     TEXT CHECK (status IN ('completed', 'dispensed')),
    UNIQUE (project_id, document)
);
CREATE INDEX IF NOT EXISTS forecast_builderlog_project_idx ON forecast_builderlog (project_id);

-- A cópia do Atlas. Categoria conta como subida quando a obra tem documento
-- vivo marcado nela, qualquer andar ou unidade; "On BuilderLog" quando a obra
-- existe no Atlas.
INSERT INTO forecast_builderlog (project_id, document, position, status)
SELECT fc.id, cat.document, cat.position,
       CASE
         WHEN cat.document = 'On BuilderLog' THEN
           CASE WHEN EXISTS (SELECT 1 FROM atlas_jobsite j WHERE j.forecast_id = fc.id)
                THEN 'completed' END
         WHEN EXISTS (
           SELECT 1
             FROM atlas_jobsite j
             JOIN atlas_document d      ON d.jobsite_id = j.id AND d.archived_at IS NULL
             JOIN atlas_document_tag t  ON t.document_id = d.id
             JOIN atlas_doc_category ac ON ac.id = t.category_id
            WHERE j.forecast_id = fc.id
              AND ac.build_type = cat.build_type
              AND lower(ac.name) = lower(cat.document))
         THEN 'completed'
       END
  FROM forecast_core fc
  JOIN catalog_forecast_builderlog cat
    ON cat.build_type = CASE WHEN lower(COALESCE(fc.type, '')) = 'building' THEN 'building' ELSE 'house' END
 WHERE lower(COALESCE(fc.company, 'framing')) = 'framing'
ON CONFLICT DO NOTHING;

-- "On Atlas" morava no Fieldwire como parâmetro fora da nota. Quem responde
-- isso agora é a linha "On BuilderLog" acima.
DELETE FROM forecast_fieldwire WHERE lower(trim(document)) = 'on atlas';
DELETE FROM catalog_forecast_fieldwire WHERE lower(trim(document)) = 'on atlas';
