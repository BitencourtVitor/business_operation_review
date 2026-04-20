CREATE TABLE IF NOT EXISTS qb_credentials (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company         text        NOT NULL UNIQUE,         -- 'hvac' | 'framing' | 'pcg'
  realm_id        text        NOT NULL,                -- QuickBooks Realm ID
  access_token    text        NOT NULL,                -- AES-256-GCM encrypted
  refresh_token   text        NOT NULL,                -- AES-256-GCM encrypted
  token_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
