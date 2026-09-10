-- A escala da prancha, a medição sobre ela, e as políticas do offline.
--
-- Três coisas que faltavam no esquema para o resto do trabalho ter onde se
-- apoiar. Vêm juntas porque nenhuma delas é grande sozinha, e separá-las em três
-- migrações só multiplicaria o número da versão.

-- ── 1. Escala ───────────────────────────────────────────────────────────────
--
-- Medir sobre a planta exige saber quantos pés do mundo cabem num ponto do PDF.
-- Sem isso a trena devolve números de tela, que não significam nada em obra.
--
-- Fica na folha e não no documento porque a escala varia entre pranchas do mesmo
-- set: a planta baixa está em 1/4" = 1', o detalhe ao lado está em 1 1/2" = 1'.
-- Guardar no documento obrigaria a folha a mentir sobre si mesma.
--
-- `scale_units_per_pt` é o número que a medição usa: quantas unidades do mundo
-- por ponto de PDF. `scale_label` é o que estava escrito na prancha, guardado
-- como texto porque é notação humana ("1/4\" = 1'-0\"") e não se recalcula a
-- partir do número sem perder a forma.
ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS scale_units_per_pt DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS scale_label        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS scale_unit         TEXT NOT NULL DEFAULT 'ft'
        CHECK (scale_unit IN ('ft', 'in', 'm', 'cm', 'mm')),
    -- De onde a escala veio. Importa porque muda o quanto se confia nela: lida
    -- do carimbo é palpite do sistema e merece conferência; calibrada é a
    -- pessoa tendo apontado dois pontos de distância conhecida, e vale mais.
    ADD COLUMN IF NOT EXISTS scale_source TEXT NOT NULL DEFAULT ''
        CHECK (scale_source IN ('', 'declared', 'calibrated'));

-- ── 2. Medição ──────────────────────────────────────────────────────────────
--
-- A medida é uma anotação como as outras: tem posição, autor e vive sobre uma
-- folha. Entra pela mesma porta da caneta e do link, e não numa tabela nova, e
-- pelo mesmo motivo que o link entrou assim: o que muda é o que a geometria
-- carrega, e ela já é jsonb.
--
-- Ficam guardados os pontos em coordenada normalizada, e não o resultado em pés.
-- O resultado é derivado da escala, e a escala pode ser corrigida depois; medida
-- gravada em pés viraria mentira no dia da correção, enquanto os pontos
-- continuam verdadeiros.
ALTER TABLE atlas_annotation DROP CONSTRAINT IF EXISTS atlas_annotation_tool_check;
ALTER TABLE atlas_annotation
    ADD CONSTRAINT atlas_annotation_tool_check
    CHECK (tool = ANY (ARRAY['pen'::text, 'highlighter'::text, 'link'::text, 'measure'::text]));

-- ── 3. Política do offline ──────────────────────────────────────────────────
--
-- A expiração por inatividade tem prazo configurável pelo administrador, e não
-- havia onde guardar isso. Uma tabela de chave e valor, e não uma coluna nova em
-- algum lugar, porque virão outras: limite de tentativas da fila, teto de
-- pré-carga, e o que mais a operação decidir.
--
-- O valor é JSONB para o número de hoje e o objeto de amanhã caberem no mesmo
-- lugar sem migração.
CREATE TABLE IF NOT EXISTS atlas_policy (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessenta dias é o padrão definido no documento de melhorias. Fica no banco e
-- não no código para o administrador poder mudar sem deploy, que é o que
-- "configurável pelo administrador" quer dizer.
INSERT INTO atlas_policy (key, value)
VALUES ('offline.expire_days', '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Limite de tentativas de uma foto na fila. Sem teto, uma imagem grande em rede
-- ruim tenta para sempre e segura a fila atrás dela.
INSERT INTO atlas_policy (key, value)
VALUES ('sync.max_attempts', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE atlas_policy IS
    'Parâmetros de operação do Atlas, mutáveis pelo administrador sem deploy.';
COMMENT ON COLUMN atlas_sheet.scale_units_per_pt IS
    'Unidades do mundo por ponto de PDF. É o fator que a medição usa; '
    'scale_label guarda a notação como estava escrita na prancha.';
