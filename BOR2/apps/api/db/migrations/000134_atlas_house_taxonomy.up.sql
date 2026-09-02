-- As categorias de casa, lidas das pastas de três lotes distintos do Fieldwire.
--
-- Os três mostram o mesmo conjunto, com as divergências de sempre: "Walls
-- Details" num, "Wall Details" no outro; "House Plan" num, "House plan" no
-- outro. Fica a grafia única.
--
-- Um dos três tem só House Plan, Option Summary e Plot Plan. Isso não é uma
-- taxonomia diferente — é um lote que ainda não recebeu o resto, e é
-- exatamente o que a vaga vazia passa a mostrar.
--
-- Trusses aparece aqui com eixo nenhum, e no prédio com eixo de andar: na casa
-- é uma pasta só. Por isso a taxonomia é por tipo de obra, e não uma lista
-- única.

INSERT INTO atlas_doc_category (client, build_type, name, axis, position, default_slot) VALUES
    ('', 'lot',   'House Plan',     'none', 200, true),
    ('', 'lot',   'Plot Plan',      'none', 210, true),
    ('', 'lot',   'Option Summary', 'none', 220, true),
    ('', 'lot',   'AOS Diagrams',   'none', 230, true),
    ('', 'lot',   'Panels Plan',    'none', 240, true),
    ('', 'lot',   'Wall Details',   'none', 250, true),
    ('', 'lot',   'Trusses',        'none', 260, true),
    ('', 'lot',   'SPF',            'none', 270, true),

    ('', 'house', 'House Plan',     'none', 300, true),
    ('', 'house', 'Plot Plan',      'none', 310, true),
    ('', 'house', 'Option Summary', 'none', 320, true),
    ('', 'house', 'AOS Diagrams',   'none', 330, true),
    ('', 'house', 'Panels Plan',    'none', 340, true),
    ('', 'house', 'Wall Details',   'none', 350, true),
    ('', 'house', 'Trusses',        'none', 360, true),
    ('', 'house', 'SPF',            'none', 370, true)
ON CONFLICT (client, build_type, name) DO NOTHING;
