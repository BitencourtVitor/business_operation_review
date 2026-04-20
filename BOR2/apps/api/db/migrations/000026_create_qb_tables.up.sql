-- QuickBooks sync tables
-- company column: 'hvac' | 'framing' | 'pcg'
-- external_id: QuickBooks entity Id (unique per company+entity)
-- last_sync_at tracked in qb_sync_state per company

-- ─── Sync state ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_sync_state (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company        text        NOT NULL,
  entity         text        NOT NULL,
  last_synced_at timestamptz,
  synced_count   integer     NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, entity)
);

-- ─── Bills ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_bills (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company      text        NOT NULL,
  external_id  text        NOT NULL,
  doc_number   text,
  txn_date     date,
  due_date     date,
  vendor_id    text,
  vendor_name  text,
  total_amount numeric,
  balance      numeric,
  updated_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_bill_lines (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id          uuid    NOT NULL REFERENCES qb_bills (id) ON DELETE CASCADE,
  company          text    NOT NULL,
  line_id          text,
  description      text,
  amount           numeric,
  account_ref_id   text,
  account_ref_name text,
  customer_id      text,
  customer_name    text,
  UNIQUE (company, bill_id, line_id)
);

CREATE TABLE IF NOT EXISTS qb_bill_links (
  id       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id  uuid        NOT NULL REFERENCES qb_bills (id) ON DELETE CASCADE,
  company  text        NOT NULL,
  txn_id   text        NOT NULL,
  txn_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, bill_id, txn_id)
);

-- ─── Bill Payments ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_bill_payments (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company           text        NOT NULL,
  external_id       text        NOT NULL,
  vendor_id         text        NOT NULL,
  vendor_name       text,
  pay_type          text        NOT NULL,
  total_amount      numeric     NOT NULL,
  currency          text,
  txn_date          date,
  doc_number        text,
  private_note      text,
  bank_account_id   text,
  bank_account_name text,
  cc_account_id     text,
  cc_account_name   text,
  updated_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_bill_payment_links (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_payment_id  uuid    NOT NULL REFERENCES qb_bill_payments (id) ON DELETE CASCADE,
  company          text    NOT NULL,
  txn_id           text    NOT NULL,
  txn_type         text    NOT NULL,
  amount           numeric NOT NULL,
  UNIQUE (company, bill_payment_id, txn_id)
);

-- ─── Estimates ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_estimates (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company       text        NOT NULL,
  external_id   text        NOT NULL,
  doc_number    text,
  txn_date      date,
  txn_status    text,
  accepted_date date,
  customer_id   text,
  customer_name text,
  total_amount  numeric,
  updated_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_estimate_lines (
  id            uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id   uuid    NOT NULL REFERENCES qb_estimates (id) ON DELETE CASCADE,
  company       text    NOT NULL,
  line_id       text,
  line_num      integer,
  description   text,
  amount        numeric,
  unit_price    numeric,
  quantity      numeric,
  item_ref_id   text,
  item_ref_name text,
  tax_code_ref  text,
  detail_type   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, estimate_id, line_id)
);

CREATE TABLE IF NOT EXISTS qb_estimate_links (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id uuid        NOT NULL REFERENCES qb_estimates (id) ON DELETE CASCADE,
  company     text        NOT NULL,
  txn_id      text        NOT NULL,
  txn_type    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, estimate_id, txn_id)
);

-- ─── Invoices ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_invoices (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company       text        NOT NULL,
  external_id   text        NOT NULL,
  doc_number    text,
  txn_date      date,
  due_date      date,
  customer_id   text,
  customer_name text,
  total_amount  numeric,
  balance       numeric,
  updated_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_invoice_lines (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id       uuid        NOT NULL REFERENCES qb_invoices (id) ON DELETE CASCADE,
  company          text        NOT NULL,
  external_line_id text,
  description      text,
  amount           numeric,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, invoice_id, external_line_id)
);

CREATE TABLE IF NOT EXISTS qb_invoice_links (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id      uuid        NOT NULL REFERENCES qb_invoices (id) ON DELETE CASCADE,
  company         text        NOT NULL,
  linked_txn_id   text        NOT NULL,
  linked_txn_type text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, invoice_id, linked_txn_id)
);

-- ─── Payments ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_payments (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company            text        NOT NULL,
  external_id        text        NOT NULL,
  customer_id        text,
  customer_name      text,
  total_amount       numeric,
  currency           text,
  payment_ref        text,
  payment_method_id  text,
  deposit_account_id text,
  private_note       text,
  txn_date           date,
  updated_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_payment_links (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id       uuid    NOT NULL REFERENCES qb_payments (id) ON DELETE CASCADE,
  company          text    NOT NULL,
  txn_id           text    NOT NULL,
  txn_type         text,
  amount           numeric,
  open_balance     numeric,
  reference_number text,
  UNIQUE (company, payment_id, txn_id)
);

-- ─── Purchases ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_purchases (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company          text        NOT NULL,
  external_id      text        NOT NULL,
  payment_type     text,
  total_amount     numeric,
  currency         text,
  txn_date         date,
  private_note     text,
  account_ref_id   text,
  account_ref_name text,
  updated_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_purchase_lines (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id      uuid    NOT NULL REFERENCES qb_purchases (id) ON DELETE CASCADE,
  company          text    NOT NULL,
  external_line_id text,
  description      text,
  amount           numeric,
  detail_type      text,
  account_ref_id   text,
  account_ref_name text,
  billable_status  text,
  tax_code_ref     text,
  customer_id      text,
  customer_name    text,
  UNIQUE (company, purchase_id, external_line_id)
);

-- ─── Vendor Credits ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_vendor_credits (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company         text        NOT NULL,
  external_id     text        NOT NULL,
  doc_number      text,
  txn_date        date,
  vendor_id       text,
  vendor_name     text,
  total_amount    numeric,
  currency        text,
  ap_account_id   text,
  ap_account_name text,
  updated_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_vendor_credit_lines (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_credit_id uuid    NOT NULL REFERENCES qb_vendor_credits (id) ON DELETE CASCADE,
  company          text    NOT NULL,
  external_line_id text,
  line_num         integer,
  description      text,
  amount           numeric,
  detail_type      text,
  account_ref_id   text,
  account_ref_name text,
  customer_id      text,
  customer_name    text,
  billable_status  text,
  tax_code_ref     text,
  UNIQUE (company, vendor_credit_id, external_line_id)
);

-- ─── Deposits ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_deposits (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company              text        NOT NULL,
  external_id          text        NOT NULL,
  doc_number           text,
  txn_date             date,
  total_amount         numeric,
  currency             text,
  private_note         text,
  deposit_account_id   text,
  deposit_account_name text,
  updated_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_deposit_lines (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deposit_id          uuid    NOT NULL REFERENCES qb_deposits (id) ON DELETE CASCADE,
  company             text    NOT NULL,
  external_line_id    text,
  line_num            integer,
  description         text,
  amount              numeric,
  memo                text,
  payment_method_id   text,
  payment_method_name text,
  customer_id         text,
  customer_name       text,
  account_id          text,
  account_name        text,
  UNIQUE (company, deposit_id, external_line_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_qb_bills_company            ON qb_bills            (company);
CREATE INDEX IF NOT EXISTS idx_qb_bills_txn_date           ON qb_bills            (txn_date);
CREATE INDEX IF NOT EXISTS idx_qb_bill_lines_bill_id       ON qb_bill_lines       (bill_id);
CREATE INDEX IF NOT EXISTS idx_qb_bill_links_bill_id       ON qb_bill_links       (bill_id);
CREATE INDEX IF NOT EXISTS idx_qb_bill_payments_company    ON qb_bill_payments    (company);
CREATE INDEX IF NOT EXISTS idx_qb_bill_payment_links_bp_id ON qb_bill_payment_links (bill_payment_id);
CREATE INDEX IF NOT EXISTS idx_qb_estimates_company        ON qb_estimates        (company);
CREATE INDEX IF NOT EXISTS idx_qb_estimate_lines_est_id    ON qb_estimate_lines   (estimate_id);
CREATE INDEX IF NOT EXISTS idx_qb_estimate_links_est_id    ON qb_estimate_links   (estimate_id);
CREATE INDEX IF NOT EXISTS idx_qb_invoices_company         ON qb_invoices         (company);
CREATE INDEX IF NOT EXISTS idx_qb_invoices_txn_date        ON qb_invoices         (txn_date);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_lines_inv_id     ON qb_invoice_lines    (invoice_id);
CREATE INDEX IF NOT EXISTS idx_qb_invoice_links_inv_id     ON qb_invoice_links    (invoice_id);
CREATE INDEX IF NOT EXISTS idx_qb_payments_company         ON qb_payments         (company);
CREATE INDEX IF NOT EXISTS idx_qb_payment_links_pay_id     ON qb_payment_links    (payment_id);
CREATE INDEX IF NOT EXISTS idx_qb_purchases_company        ON qb_purchases        (company);
CREATE INDEX IF NOT EXISTS idx_qb_purchases_txn_date       ON qb_purchases        (txn_date);
CREATE INDEX IF NOT EXISTS idx_qb_purchase_lines_pur_id    ON qb_purchase_lines   (purchase_id);
CREATE INDEX IF NOT EXISTS idx_qb_vendor_credits_company   ON qb_vendor_credits   (company);
CREATE INDEX IF NOT EXISTS idx_qb_vendor_credit_lines_vc_id ON qb_vendor_credit_lines (vendor_credit_id);
CREATE INDEX IF NOT EXISTS idx_qb_deposits_company         ON qb_deposits         (company);
CREATE INDEX IF NOT EXISTS idx_qb_deposit_lines_dep_id     ON qb_deposit_lines    (deposit_id);
