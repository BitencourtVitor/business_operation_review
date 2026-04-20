CREATE TABLE IF NOT EXISTS catalog_clients (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_job_sites (
  id         BIGSERIAL PRIMARY KEY,
  client_id  BIGINT NOT NULL REFERENCES catalog_clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, name)
);

-- Populate clients from existing forecast_core data
INSERT INTO catalog_clients (name)
SELECT DISTINCT TRIM(cliente)
FROM forecast_core
WHERE TRIM(cliente) <> ''
ON CONFLICT (name) DO NOTHING;

-- Populate job_sites from existing forecast_core data
INSERT INTO catalog_job_sites (client_id, name)
SELECT DISTINCT c.id, TRIM(f.job_site)
FROM forecast_core f
JOIN catalog_clients c ON LOWER(c.name) = LOWER(TRIM(f.cliente))
WHERE TRIM(f.job_site) <> ''
ON CONFLICT (client_id, name) DO NOTHING;
