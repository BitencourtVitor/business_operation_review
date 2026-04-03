-- Generic raw storage for QuickBooks data.
-- Structured views/tables can be derived from this as needed.
CREATE TABLE qb_raw (
  id          BIGSERIAL   PRIMARY KEY,
  company     TEXT        NOT NULL,
  entity      TEXT        NOT NULL,
  external_id TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company, entity, external_id)
);

CREATE INDEX idx_qb_raw_company_entity ON qb_raw(company, entity);
CREATE INDEX idx_qb_raw_synced_at      ON qb_raw(synced_at);
CREATE INDEX idx_qb_raw_data           ON qb_raw USING gin(data);
