-- PCG-3: o catálogo do PCG (trades, perguntas, regras, blocos do documento, revisões e
-- subcontratados) saiu do localStorage do navegador. Fica num documento só, no mesmo
-- formato que o front já usava, e a última gravação vale.
CREATE TABLE IF NOT EXISTS pcg_catalog (
  id         text        PRIMARY KEY DEFAULT 'main',
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text        NOT NULL DEFAULT ''
);

-- Cópia de cada catálogo que existia no navegador de alguém na hora da migração.
-- A primeira vira o oficial; as outras ficam aqui para nada se perder.
CREATE TABLE IF NOT EXISTS pcg_catalog_imports (
  id          bigserial   PRIMARY KEY,
  data        jsonb       NOT NULL,
  imported_by text        NOT NULL DEFAULT '',
  imported_at timestamptz NOT NULL DEFAULT now(),
  adopted     boolean     NOT NULL DEFAULT false
);
