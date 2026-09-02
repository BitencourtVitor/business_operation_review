-- A taxonomia de documento da obra: categoria, eixo e as vagas que nascem daí.
--
-- Hoje a pasta de documento nasce do nome do arquivo que alguém subiu. É por
-- isso que o Fieldwire tem "Riverview 50 1st Panels Walls 013026" ao lado de
-- "Panels Fourth Floor" e de "4th floor wall panel layout": três nomes para a
-- mesma coisa, em três grafias, porque ninguém declarou que Wall Panels é uma
-- categoria que varia por andar.
--
-- Aqui a categoria declara o eixo pelo qual ela se divide, e a subcategoria
-- deixa de ser digitada: sai do próprio cadastro da obra — os andares que o
-- prédio tem, as letras de unidade que ele tem.

CREATE TABLE IF NOT EXISTS atlas_doc_category (
    id          BIGSERIAL PRIMARY KEY,
    -- Vazio vale para qualquer cliente, como no catálogo do Forecast.
    client      TEXT NOT NULL DEFAULT '',
    -- building | lot | house. Vazio vale para qualquer formato de obra.
    build_type  TEXT NOT NULL DEFAULT '',
    name        TEXT NOT NULL,
    -- none  → uma vaga só
    -- floor → uma vaga por andar da obra
    -- unit  → uma vaga por letra de unidade da obra
    axis        TEXT NOT NULL DEFAULT 'none' CHECK (axis IN ('none', 'floor', 'unit')),
    -- Ordem em que as vagas aparecem na obra. Sem isso a lista sai por id, que
    -- é ordem de cadastro e não ordem de leitura.
    position    INT  NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client, build_type, name)
);

-- Quantos andares o prédio tem e quais letras de unidade ele usa. É daqui que
-- as subcategorias saem: sem isso, "3rd Floor Trusses" volta a ser digitado à
-- mão, com a grafia que der na cabeça de quem digita.
ALTER TABLE atlas_jobsite
    ADD COLUMN IF NOT EXISTS floors INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit_labels TEXT[] NOT NULL DEFAULT '{}';

-- A vaga que a obra espera receber. `subcategory` guarda o valor do eixo — o
-- número do andar, a letra da unidade — e fica vazia quando a categoria não
-- tem eixo.
ALTER TABLE atlas_document
    ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES atlas_doc_category(id),
    ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT '';

-- Uma vaga por categoria e valor de eixo dentro da obra: duas pastas "3rd Floor
-- Trusses" na mesma obra é a bagunça que este trabalho existe para desfazer.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_document_slot_uniq
    ON atlas_document (jobsite_id, category, subcategory)
    WHERE archived_at IS NULL;

-- Taxonomia inicial, lida das pastas reais do Fieldwire do Riverview Building 2
-- e do prédio da segunda captura. Serve de ponto de partida e é editável na
-- tela de Jobsite Definitions.
INSERT INTO atlas_doc_category (client, build_type, name, axis, position) VALUES
    ('', '',         'Architectural Plan', 'none',  10),
    ('', '',         'Structural Plan',    'none',  20),
    ('', '',         'Permit Set',         'none',  30),
    ('', 'building', 'Floor Layout',       'floor', 40),
    ('', 'building', 'Wall Panels',        'floor', 50),
    ('', 'building', 'Trusses',            'floor', 60),
    ('', 'building', 'Trusses Placement',  'floor', 70),
    ('', 'building', 'Cabinet Layout',     'unit',  80),
    ('', '',         'Island Dimensions',  'none',  90),
    ('', '',         'Details',            'none', 100),
    ('', 'lot',      'House Plan',         'none', 110),
    ('', 'house',    'House Plan',         'none', 111)
ON CONFLICT (client, build_type, name) DO NOTHING;
