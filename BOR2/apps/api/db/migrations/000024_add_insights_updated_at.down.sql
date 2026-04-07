ALTER TABLE destaques           DROP COLUMN IF EXISTS updated_at;
ALTER TABLE destaques_positivos DROP COLUMN IF EXISTS updated_at;
ALTER TABLE destaques_negativos DROP COLUMN IF EXISTS updated_at;
ALTER TABLE oportunidades       DROP COLUMN IF EXISTS updated_at;
ALTER TABLE planos_de_acao      DROP COLUMN IF EXISTS updated_at;
ALTER TABLE acoes               DROP COLUMN IF EXISTS updated_at;
