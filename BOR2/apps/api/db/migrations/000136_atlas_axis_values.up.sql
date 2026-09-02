-- As subcategorias possíveis de cada categoria.
--
-- O eixo diz *como* a categoria se divide; esta coluna diz *em quais valores*.
-- Sem ela, a tela de taxonomia só conseguia mostrar o que já virou pasta em
-- alguma obra — e antes da primeira obra não havia o que mostrar, o que deixa
-- quem cadastra sem saber que opções existem.
--
-- Andar vai do primeiro ao quinto, que é o teto dos prédios da Premium hoje.
-- Unidade usa as letras vistas nas pastas reais do Fieldwire.
ALTER TABLE atlas_doc_category
    ADD COLUMN IF NOT EXISTS axis_values TEXT[] NOT NULL DEFAULT '{}';

UPDATE atlas_doc_category
   SET axis_values = ARRAY['1st','2nd','3rd','4th','5th']
 WHERE axis = 'floor' AND axis_values = '{}';

UPDATE atlas_doc_category
   SET axis_values = ARRAY['C','F','H','I','J','L','M']
 WHERE axis = 'unit' AND axis_values = '{}';
