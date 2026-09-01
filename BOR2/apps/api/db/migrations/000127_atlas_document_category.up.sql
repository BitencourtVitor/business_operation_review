-- Categoria do documento, como a empresa já a define.
--
-- O `kind` que existia aqui (drawing/spec/permit/submittal/other) era invenção
-- minha na hora de modelar. A taxonomia real já existe e está em uso:
-- `catalog_forecast_fieldwire` lista, por cliente, quais documentos uma obra
-- precisa ter — "House Plan" para Private, "Architecture Plans", "Trusses
-- Plans" e "Wall Panels" para Pulte, "Plot Plan" e "SPF" para Toll Brothers.
-- É essa lista que o score de Fieldwire do Forecast cobra hoje.
--
-- Usar a mesma taxonomia é o que permite, mais adiante, o Forecast perguntar ao
-- Atlas se o documento existe em vez de alguém marcar uma caixinha à mão.
--
-- `category` é texto livre, não FK: o catálogo é por cliente e muda com o
-- tempo, e uma obra pode receber um documento que ninguém cadastrou ainda. A
-- lista serve de sugestão, não de cadeado.
ALTER TABLE atlas_document
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';

-- O que já estava gravado vira categoria a partir do nome, quando bate com o
-- catálogo; o resto fica em branco esperando quem souber.
UPDATE atlas_document d
SET category = c.document
FROM catalog_forecast_fieldwire c
WHERE d.category = ''
  AND lower(d.name) LIKE '%' || lower(c.document) || '%';

ALTER TABLE atlas_document DROP COLUMN IF EXISTS kind;

CREATE INDEX IF NOT EXISTS atlas_document_category_idx ON atlas_document (category);
