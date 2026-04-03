CREATE TYPE accounting_type AS ENUM ('receivables', 'payables');

CREATE TABLE accounting_records (
  id          TEXT           PRIMARY KEY,
  company     company_name   NOT NULL,
  type        accounting_type NOT NULL,
  month       TEXT           NOT NULL,
  year        INTEGER        NOT NULL,
  amount      NUMERIC(15,2)  NOT NULL DEFAULT 0,
  description TEXT           NOT NULL DEFAULT '',
  category    TEXT           NOT NULL DEFAULT '',
  due_date    DATE,
  paid_date   DATE,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounting_company ON accounting_records(company);
CREATE INDEX idx_accounting_type    ON accounting_records(type);
CREATE INDEX idx_accounting_year    ON accounting_records(year);
