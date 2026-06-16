-- Expand QuickBooks coverage.
-- Adds structured tables for entities the app queries directly:
--   PurchaseOrder (+lines+links), Account, Vendor, Customer.
-- Every other entity with data is captured generically in qb_raw (migration 000006).
--
-- Coverage decision: Attachable is intentionally NOT synced. In Premium's books an
-- Attachable is a file (transaction receipt/proof) attached to a record — not financial
-- data — and it is the highest-volume entity (20k+ per company). TimeActivity is also
-- excluded: QB Time is handled by the separate QBT pipeline.

-- ─── Purchase Orders ───────────────────────────────────────────────────────────
-- A PO is the projected/committed cost to a vendor (subcontractor) for a job, before
-- the bill exists. line.received tracks how much has been fulfilled; LinkedTxn → Bill
-- ties it to the actual spend.

CREATE TABLE IF NOT EXISTS qb_purchase_orders (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company         text        NOT NULL,
  external_id     text        NOT NULL,
  doc_number      text,
  txn_date        date,
  po_status       text,
  vendor_id       text,
  vendor_name     text,
  ap_account_id   text,
  ap_account_name text,
  total_amount    numeric,
  private_note    text,
  memo            text,
  updated_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

CREATE TABLE IF NOT EXISTS qb_purchase_order_lines (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id            uuid    NOT NULL REFERENCES qb_purchase_orders (id) ON DELETE CASCADE,
  company          text    NOT NULL,
  line_id          text,
  description      text,
  amount           numeric,
  received         numeric,
  detail_type      text,
  account_ref_id   text,
  account_ref_name text,
  item_ref_id      text,
  item_ref_name    text,
  customer_id      text,
  customer_name    text,
  class_ref_id     text,
  class_ref_name   text,
  project_ref      text,
  billable_status  text,
  tax_code_ref     text,
  UNIQUE (company, po_id, line_id)
);

CREATE TABLE IF NOT EXISTS qb_purchase_order_links (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id      uuid        NOT NULL REFERENCES qb_purchase_orders (id) ON DELETE CASCADE,
  company    text        NOT NULL,
  txn_id     text        NOT NULL,
  txn_type   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, po_id, txn_id)
);

-- ─── Accounts (chart of accounts) ──────────────────────────────────────────────
-- Enables classifying "subcontractor / labor" by AccountType/SubType/hierarchy
-- instead of brittle name matching.

CREATE TABLE IF NOT EXISTS qb_accounts (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company              text        NOT NULL,
  external_id          text        NOT NULL,
  name                 text,
  fully_qualified_name text,
  acct_num             text,
  account_type         text,
  account_sub_type     text,
  classification       text,
  current_balance      numeric,
  active               boolean,
  sub_account          boolean,
  parent_id            text,
  parent_name          text,
  description          text,
  updated_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

-- ─── Vendors (subcontractor master) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_vendors (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company      text        NOT NULL,
  external_id  text        NOT NULL,
  display_name text,
  company_name text,
  active       boolean,
  vendor_1099  boolean,
  balance      numeric,
  email        text,
  phone        text,
  updated_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

-- ─── Customers (project / job master) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qb_customers (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company              text        NOT NULL,
  external_id          text        NOT NULL,
  display_name         text,
  fully_qualified_name text,
  company_name         text,
  active               boolean,
  job                  boolean,
  parent_id            text,
  parent_name          text,
  balance              numeric,
  balance_with_jobs    numeric,
  email                text,
  level                integer,
  updated_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company, external_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_qb_purchase_orders_company   ON qb_purchase_orders      (company);
CREATE INDEX IF NOT EXISTS idx_qb_purchase_orders_txn_date  ON qb_purchase_orders      (txn_date);
CREATE INDEX IF NOT EXISTS idx_qb_purchase_orders_status    ON qb_purchase_orders      (company, po_status);
CREATE INDEX IF NOT EXISTS idx_qb_po_lines_po_id            ON qb_purchase_order_lines (po_id);
CREATE INDEX IF NOT EXISTS idx_qb_po_lines_customer         ON qb_purchase_order_lines (company, customer_id);
CREATE INDEX IF NOT EXISTS idx_qb_po_links_po_id            ON qb_purchase_order_links (po_id);
CREATE INDEX IF NOT EXISTS idx_qb_accounts_company          ON qb_accounts             (company);
CREATE INDEX IF NOT EXISTS idx_qb_accounts_type             ON qb_accounts             (company, account_type, account_sub_type);
CREATE INDEX IF NOT EXISTS idx_qb_vendors_company           ON qb_vendors              (company);
CREATE INDEX IF NOT EXISTS idx_qb_customers_company         ON qb_customers            (company);
CREATE INDEX IF NOT EXISTS idx_qb_customers_parent          ON qb_customers            (company, parent_id);
