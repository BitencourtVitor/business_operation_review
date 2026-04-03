-- Schema para PCG (Precision Construction Group)
-- Tabelas ordenadas para respeitar as dependências de foreign key

-- 1. Tabelas principais (sem dependências)
CREATE TABLE public.pcg_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  doc_number text,
  txn_date date,
  due_date date,
  vendor_id text,
  vendor_name text,
  total_amount numeric,
  balance numeric,
  CONSTRAINT pcg_bills_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_bill_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  vendor_id text NOT NULL,
  vendor_name text,
  pay_type text NOT NULL,
  total_amount numeric NOT NULL,
  currency text,
  txn_date date,
  doc_number text,
  private_note text,
  bank_account_id text,
  bank_account_name text,
  cc_account_id text,
  cc_account_name text,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  CONSTRAINT pcg_bill_payments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_deposits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  doc_number text,
  txn_date date,
  total_amount numeric,
  currency text,
  private_note text,
  deposit_account_id text,
  deposit_account_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT pcg_deposits_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  doc_number text,
  txn_date date,
  txn_status text,
  accepted_date date,
  customer_id text,
  customer_name text,
  total_amount numeric,
  CONSTRAINT pcg_estimates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  doc_number text,
  txn_date date,
  due_date date,
  customer_id text,
  customer_name text,
  total_amount numeric,
  balance numeric,
  last_updated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pcg_invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_payments (
  id text NOT NULL,
  customer_id text,
  customer_name text,
  total_amount numeric,
  currency text,
  payment_ref text,
  payment_method_id text,
  deposit_account_id text,
  private_note text,
  txn_date date,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT pcg_payments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  payment_type text,
  total_amount numeric,
  currency text,
  txn_date date,
  private_note text,
  account_ref_id text,
  account_ref_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT pcg_purchases_pkey PRIMARY KEY (id)
);

CREATE TABLE public.pcg_vendor_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  doc_number text,
  txn_date date,
  vendor_id text,
  vendor_name text,
  total_amount numeric,
  currency text,
  ap_account_id text,
  ap_account_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  CONSTRAINT pcg_vendor_credits_pkey PRIMARY KEY (id)
);

-- 2. Tabelas de linhas e links (com dependências)
CREATE TABLE public.pcg_bill_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT pcg_bill_lines_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_bill_lines_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.pcg_bills(id)
);

CREATE TABLE public.pcg_bill_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pcg_bill_links_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_bill_links_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.pcg_bills(id)
);

CREATE TABLE public.pcg_bill_payment_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_payment_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text NOT NULL,
  amount numeric NOT NULL,
  CONSTRAINT pcg_bill_payment_links_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_bill_payment_links_bill_payment_id_fkey FOREIGN KEY (bill_payment_id) REFERENCES public.pcg_bill_payments(id)
);

CREATE TABLE public.pcg_deposit_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL,
  external_line_id text,
  line_num integer,
  description text,
  amount numeric,
  memo text,
  payment_method_id text,
  payment_method_name text,
  customer_id text,
  customer_name text,
  account_id text,
  account_name text,
  CONSTRAINT pcg_deposit_lines_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_deposit_lines_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.pcg_deposits(id)
);

CREATE TABLE public.pcg_estimate_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  line_id text,
  line_num integer,
  description text,
  amount numeric,
  unit_price numeric,
  quantity numeric,
  item_ref_id text,
  item_ref_name text,
  tax_code_ref text,
  detail_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pcg_estimate_lines_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_estimate_lines_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.pcg_estimates(id)
);

CREATE TABLE public.pcg_estimate_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pcg_estimate_links_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_estimate_links_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.pcg_estimates(id)
);

CREATE TABLE public.pcg_invoice_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  external_line_id text,
  description text,
  amount numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pcg_invoice_lines_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.pcg_invoices(id)
);

CREATE TABLE public.pcg_invoice_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  linked_txn_id text NOT NULL,
  linked_txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pcg_invoice_links_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_invoice_links_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.pcg_invoices(id)
);

CREATE TABLE public.pcg_payment_links (
  payment_id text,
  txn_id text,
  txn_type text,
  amount numeric,
  open_balance numeric,
  reference_number text,
  CONSTRAINT pcg_payment_links_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.pcg_payments(id)
);

CREATE TABLE public.pcg_purchase_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  external_line_id text,
  description text,
  amount numeric,
  detail_type text,
  account_ref_id text,
  account_ref_name text,
  billable_status text,
  tax_code_ref text,
  customer_id text,
  customer_name text,
  CONSTRAINT pcg_purchase_lines_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.pcg_purchases(id)
);

CREATE TABLE public.pcg_vendor_credit_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vendor_credit_id uuid NOT NULL,
  external_line_id text,
  line_num integer,
  description text,
  amount numeric,
  detail_type text,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  billable_status text,
  tax_code_ref text,
  CONSTRAINT pcg_vendor_credit_lines_pkey PRIMARY KEY (id),
  CONSTRAINT pcg_vendor_credit_lines_vendor_credit_id_fkey FOREIGN KEY (vendor_credit_id) REFERENCES public.pcg_vendor_credits(id)
);
