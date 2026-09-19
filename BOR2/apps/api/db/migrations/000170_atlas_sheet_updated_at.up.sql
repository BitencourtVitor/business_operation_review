-- Quando a folha mudou pela última vez.
--
-- A gravação de nomes já escrevia nesta coluna, que nunca existiu: o UPDATE
-- falhava com 42703 e nenhum nome de folha chegava ao banco (ATL-119). A coluna
-- entra porque a informação é legítima: folha é renomeada, tem escala corrigida
-- e é herdada de revisão anterior, e saber quando isso aconteceu é o que separa
-- "ninguém mexeu" de "mexeram ontem".
ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
