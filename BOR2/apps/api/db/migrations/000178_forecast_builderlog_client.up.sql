-- Os documentos esperados no BuilderLog passam a depender do cliente, como os
-- do Fieldwire (F-20). Casa da Pulte recebia a lista da Toll, e quem cuidava da
-- obra tinha de dispensar à mão o que a Pulte não tem.
--
-- Cliente vazio vale para todos: é o caso de "On BuilderLog" e da lista de
-- prédio, que segue única.
ALTER TABLE catalog_forecast_builderlog ADD COLUMN IF NOT EXISTS client TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_forecast_builderlog DROP CONSTRAINT IF EXISTS catalog_forecast_builderlog_build_type_document_key;
ALTER TABLE catalog_forecast_builderlog ADD CONSTRAINT catalog_forecast_builderlog_client_build_type_document_key
    UNIQUE (client, build_type, document);

-- A lista de casa que existia é a da Toll, e a Private segue com a mesma.
INSERT INTO catalog_forecast_builderlog (client, build_type, document, position)
SELECT 'Private', build_type, document, position
  FROM catalog_forecast_builderlog
 WHERE client = '' AND build_type = 'house' AND document <> 'On BuilderLog';

UPDATE catalog_forecast_builderlog SET client = 'Toll Brothers'
 WHERE client = '' AND build_type = 'house' AND document <> 'On BuilderLog';

-- A da Pulte sai do que o Fieldwire pede para lote dela (Architecture Plans,
-- House Plan, Markup, Trusses Plans), com o nome da categoria no BuilderLog.
INSERT INTO catalog_forecast_builderlog (client, build_type, document, position) VALUES
    ('Pulte Homes', 'house', 'Architectural Plan', 10),
    ('Pulte Homes', 'house', 'House Plan', 111),
    ('Pulte Homes', 'house', 'Trusses', 360),
    ('Pulte Homes', 'house', 'Markup Plans', 380);

-- Nas casas da Pulte que já existem: sai o que era da Toll, menos o que alguém
-- marcou como subido, e entra o que faltava.
DELETE FROM forecast_builderlog b
 USING forecast_core fc
 WHERE fc.id = b.project_id
   AND lower(fc.cliente) = 'pulte homes'
   AND lower(COALESCE(fc.type, '')) <> 'building'
   AND b.document IN ('AOS Diagrams', 'Panels Plan', 'Plot Plan', 'SPF', 'Wall Details')
   AND b.status IS DISTINCT FROM 'completed';

INSERT INTO forecast_builderlog (project_id, document, position)
SELECT fc.id, c.document, c.position
  FROM forecast_core fc
  JOIN catalog_forecast_builderlog c ON c.client = 'Pulte Homes' AND c.build_type = 'house'
 WHERE lower(fc.cliente) = 'pulte homes'
   AND lower(COALESCE(fc.type, '')) <> 'building'
   AND lower(COALESCE(fc.company, 'framing')) = 'framing'
ON CONFLICT (project_id, document) DO NOTHING;
