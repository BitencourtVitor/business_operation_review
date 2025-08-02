-- Criar tabelas FRAMING
-- Execute este SQL no seu banco Supabase

CREATE TABLE IF NOT EXISTS public.framing_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  vendor_id text,
  vendor_name text,
  total_amount numeric,
  currency text,
  txn_date date,
  due_date date,
  doc_number text,
  private_note text,
  bill_status text,
  CONSTRAINT framing_bills_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_bill_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT framing_bill_lines_pkey PRIMARY KEY (id),
  CONSTRAINT framing_bill_lines_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.framing_bills(id)
);

CREATE TABLE IF NOT EXISTS public.framing_bill_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT framing_bill_links_pkey PRIMARY KEY (id),
  CONSTRAINT framing_bill_links_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.framing_bills(id)
);

CREATE TABLE IF NOT EXISTS public.framing_bill_payments (
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
  CONSTRAINT framing_bill_payments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_bill_payment_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_payment_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text NOT NULL,
  amount numeric NOT NULL,
  CONSTRAINT framing_bill_payment_links_pkey PRIMARY KEY (id),
  CONSTRAINT framing_bill_payment_links_bill_payment_id_fkey FOREIGN KEY (bill_payment_id) REFERENCES public.framing_bill_payments(id)
);

CREATE TABLE IF NOT EXISTS public.framing_deposits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  customer_id text,
  customer_name text,
  total_amount numeric,
  currency text,
  txn_date date,
  doc_number text,
  private_note text,
  deposit_status text,
  CONSTRAINT framing_deposits_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_deposit_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT framing_deposit_lines_pkey PRIMARY KEY (id),
  CONSTRAINT framing_deposit_lines_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.framing_deposits(id)
);

CREATE TABLE IF NOT EXISTS public.framing_estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  customer_id text,
  customer_name text,
  total_amount numeric,
  currency text,
  txn_date date,
  doc_number text,
  private_note text,
  estimate_status text,
  CONSTRAINT framing_estimates_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_estimate_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT framing_estimate_lines_pkey PRIMARY KEY (id),
  CONSTRAINT framing_estimate_lines_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.framing_estimates(id)
);

CREATE TABLE IF NOT EXISTS public.framing_estimate_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  CONSTRAINT framing_estimate_links_pkey PRIMARY KEY (id),
  CONSTRAINT framing_estimate_links_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.framing_estimates(id)
);

CREATE TABLE IF NOT EXISTS public.framing_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  customer_id text,
  customer_name text,
  total_amount numeric,
  currency text,
  txn_date date,
  due_date date,
  doc_number text,
  private_note text,
  invoice_status text,
  CONSTRAINT framing_invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_invoice_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT framing_invoice_lines_pkey PRIMARY KEY (id),
  CONSTRAINT framing_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.framing_invoices(id)
);

CREATE TABLE IF NOT EXISTS public.framing_invoice_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  CONSTRAINT framing_invoice_links_pkey PRIMARY KEY (id),
  CONSTRAINT framing_invoice_links_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.framing_invoices(id)
);

CREATE TABLE IF NOT EXISTS public.framing_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  customer_name text,
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
  CONSTRAINT framing_payments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_payment_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text NOT NULL,
  amount numeric NOT NULL,
  CONSTRAINT framing_payment_links_pkey PRIMARY KEY (id),
  CONSTRAINT framing_payment_links_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.framing_payments(id)
);

CREATE TABLE IF NOT EXISTS public.framing_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  vendor_id text,
  vendor_name text,
  total_amount numeric,
  currency text,
  txn_date date,
  doc_number text,
  private_note text,
  purchase_status text,
  CONSTRAINT framing_purchases_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_purchase_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT framing_purchase_lines_pkey PRIMARY KEY (id),
  CONSTRAINT framing_purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.framing_purchases(id)
);

CREATE TABLE IF NOT EXISTS public.framing_vendor_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  updated_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  vendor_id text,
  vendor_name text,
  total_amount numeric,
  currency text,
  txn_date date,
  doc_number text,
  private_note text,
  vendor_credit_status text,
  CONSTRAINT framing_vendor_credits_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.framing_vendor_credit_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vendor_credit_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT framing_vendor_credit_lines_pkey PRIMARY KEY (id),
  CONSTRAINT framing_vendor_credit_lines_vendor_credit_id_fkey FOREIGN KEY (vendor_credit_id) REFERENCES public.framing_vendor_credits(id)
); 