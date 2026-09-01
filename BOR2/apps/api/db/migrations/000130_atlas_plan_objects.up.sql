-- Cada plano também vira arquivo, e não só linha.
--
-- A 000126 guardava só o PDF original, porque cortar em páginas infla o
-- armazenamento — medição do AT-4. A medição foi refeita agora com o pdf-lib
-- sobre o set real, e o número é este:
--
--   original ................ 107,2 MB
--   51 páginas separadas .... 532,5 MB  (4,97x)
--   mediana por página ...... 1,66 MB
--   corte inteiro ........... 6,5 s de CPU
--
-- A conclusão inverteu porque a pergunta mudou. O custo do inchaço é irrisório
-- no R2 (~532 MB ≈ US$ 0,008/mês; 51 PUTs por documento não chegam perto de
-- limite nenhum). O que ele compra é a leitura: abrir um plano passa a baixar
-- 1,66 MB em vez de 107 MB — a diferença entre abrir e desistir, num tablet com
-- 4G de obra.
--
-- O original continua sendo a verdade e continua imutável: os planos são
-- derivados dele, e podem ser regerados a qualquer momento. Por isso a chave do
-- plano é nullable — folha sem arquivo ainda abre, pelo original.
ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS r2_key    TEXT   NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS byte_size BIGINT NOT NULL DEFAULT 0;
