CREATE TABLE budget_project_mappings (
  id          SERIAL PRIMARY KEY,
  company     TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  client_id   BIGINT REFERENCES catalog_clients(id) ON DELETE SET NULL,
  job_site_id BIGINT REFERENCES catalog_job_sites(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company, customer_id)
);
