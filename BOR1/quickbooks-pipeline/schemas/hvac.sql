-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.acoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plano_id uuid,
  titulo text NOT NULL,
  responsavel text,
  status text,
  data_limite date,
  CONSTRAINT acoes_pkey PRIMARY KEY (id),
  CONSTRAINT acoes_plano_id_fkey FOREIGN KEY (plano_id) REFERENCES public.planos_de_acao(id)
);
CREATE TABLE public.desafios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  oportunidade_id uuid,
  texto text NOT NULL,
  CONSTRAINT desafios_pkey PRIMARY KEY (id),
  CONSTRAINT desafios_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES public.oportunidades(id)
);
CREATE TABLE public.destaques (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  tela_id uuid,
  mes integer NOT NULL,
  ano integer NOT NULL,
  criado_em timestamp without time zone DEFAULT now(),
  CONSTRAINT destaques_pkey PRIMARY KEY (id),
  CONSTRAINT destaques_tela_id_fkey FOREIGN KEY (tela_id) REFERENCES public.telas(id),
  CONSTRAINT destaques_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.destaques_negativos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  destaque_id uuid,
  texto text NOT NULL,
  CONSTRAINT destaques_negativos_pkey PRIMARY KEY (id),
  CONSTRAINT destaques_negativos_destaque_id_fkey FOREIGN KEY (destaque_id) REFERENCES public.destaques(id)
);
CREATE TABLE public.destaques_positivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  destaque_id uuid,
  texto text NOT NULL,
  CONSTRAINT destaques_positivos_pkey PRIMARY KEY (id),
  CONSTRAINT destaques_positivos_destaque_id_fkey FOREIGN KEY (destaque_id) REFERENCES public.destaques(id)
);
CREATE TABLE public.hvac_bill_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  line_id text,
  description text,
  amount numeric,
  account_ref_id text,
  account_ref_name text,
  customer_id text,
  customer_name text,
  CONSTRAINT hvac_bill_lines_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_bill_lines_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.hvac_bills(id)
);
CREATE TABLE public.hvac_bill_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hvac_bill_links_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_bill_links_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.hvac_bills(id)
);
CREATE TABLE public.hvac_bill_payment_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_payment_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text NOT NULL,
  amount numeric NOT NULL,
  CONSTRAINT hvac_bill_payment_links_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_bill_payment_links_bill_payment_id_fkey FOREIGN KEY (bill_payment_id) REFERENCES public.hvac_bill_payments(id)
);
CREATE TABLE public.hvac_bill_payments (
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
  CONSTRAINT hvac_bill_payments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_bills (
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
  CONSTRAINT hvac_bills_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_deposit_lines (
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
  CONSTRAINT hvac_deposit_lines_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_deposit_lines_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.hvac_deposits(id)
);
CREATE TABLE public.hvac_deposits (
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
  CONSTRAINT hvac_deposits_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_estimate_lines (
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
  CONSTRAINT hvac_estimate_lines_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_estimate_lines_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.hvac_estimates(id)
);
CREATE TABLE public.hvac_estimate_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  txn_id text NOT NULL,
  txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hvac_estimate_links_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_estimate_linked_txns_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.hvac_estimates(id)
);
CREATE TABLE public.hvac_estimates (
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
  CONSTRAINT hvac_estimates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_invoice_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  external_line_id text,
  description text,
  amount numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hvac_invoice_lines_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.hvac_invoices(id)
);
CREATE TABLE public.hvac_invoice_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  linked_txn_id text NOT NULL,
  linked_txn_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hvac_invoice_links_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_invoice_links_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.hvac_invoices(id)
);
CREATE TABLE public.hvac_invoices (
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
  CONSTRAINT hvac_invoices_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_payment_links (
  payment_id text,
  txn_id text,
  txn_type text,
  amount numeric,
  open_balance numeric,
  reference_number text,
  CONSTRAINT hvac_payment_links_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.hvac_payments(id)
);
CREATE TABLE public.hvac_payments (
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
  CONSTRAINT hvac_payments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_purchase_lines (
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
  CONSTRAINT hvac_purchase_lines_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_purchase_lines_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.hvac_purchases(id)
);
CREATE TABLE public.hvac_purchases (
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
  CONSTRAINT hvac_purchases_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hvac_vendor_credit_lines (
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
  CONSTRAINT hvac_vendor_credit_lines_pkey PRIMARY KEY (id),
  CONSTRAINT hvac_vendor_credit_lines_vendor_credit_id_fkey FOREIGN KEY (vendor_credit_id) REFERENCES public.hvac_vendor_credits(id)
);
CREATE TABLE public.hvac_vendor_credits (
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
  CONSTRAINT hvac_vendor_credits_pkey PRIMARY KEY (id)
);
CREATE TABLE public.melhorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  oportunidade_id uuid,
  texto text NOT NULL,
  CONSTRAINT melhorias_pkey PRIMARY KEY (id),
  CONSTRAINT melhorias_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES public.oportunidades(id)
);
CREATE TABLE public.oportunidades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  tela_id uuid,
  mes integer NOT NULL,
  ano integer NOT NULL,
  titulo text NOT NULL,
  criado_em timestamp without time zone DEFAULT now(),
  CONSTRAINT oportunidades_pkey PRIMARY KEY (id),
  CONSTRAINT oportunidades_tela_id_fkey FOREIGN KEY (tela_id) REFERENCES public.telas(id),
  CONSTRAINT oportunidades_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.payables_accounting (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_date date,
  transaction_type text,
  bill_num text,
  vendor_display_name text,
  due_date date,
  total_amount numeric,
  open_balance numeric,
  category text,
  past_due integer,
  aging_intervals text,
  date_field date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payables_accounting_pkey PRIMARY KEY (id)
);
CREATE TABLE public.perfis (
  usuario_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo = ANY (ARRAY['user'::text, 'admin_setor'::text, 'gestor'::text, 'dev'::text, 'owner'::text])),
  tela_id uuid,
  CONSTRAINT perfis_pkey PRIMARY KEY (usuario_id),
  CONSTRAINT perfis_tela_id_fkey FOREIGN KEY (tela_id) REFERENCES public.telas(id),
  CONSTRAINT perfis_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);
CREATE TABLE public.permit_control (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model text,
  jobsite text,
  lot_address text,
  situacao text,
  solicitacao date,
  aplicacao date,
  emissao date,
  observacao text,
  arquivo text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT permit_control_pkey PRIMARY KEY (id)
);
CREATE TABLE public.planos_de_acao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  data_inicio date,
  data_fim date,
  usuario_id uuid,
  deletado boolean DEFAULT false,
  tela_id uuid,
  CONSTRAINT planos_de_acao_pkey PRIMARY KEY (id),
  CONSTRAINT planos_de_acao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id),
  CONSTRAINT planos_de_acao_tela_id_fkey FOREIGN KEY (tela_id) REFERENCES public.telas(id)
);
CREATE TABLE public.quickbooks_empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  realm_id text NOT NULL UNIQUE,
  company_name text,
  access_token text,
  refresh_token text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quickbooks_empresas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.receivables_accounting (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inv_date date,
  transaction_type text,
  inv_num text,
  customer_full_name text,
  due_date date,
  inv_amount numeric,
  open_balance numeric,
  epo_number text,
  category text,
  aging_days integer,
  aging_intervals text,
  date_field date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT receivables_accounting_pkey PRIMARY KEY (id)
);
CREATE TABLE public.service_requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  contractor text NOT NULL,
  job_site text,
  city text NOT NULL,
  lot text,
  address text NOT NULL,
  close_date date,
  date_received date,
  material_available_date date,
  resident_available_date date,
  date_completed date,
  issue text NOT NULL,
  warranty boolean NOT NULL,
  tech text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  additional_visits ARRAY,
  cost double precision DEFAULT 0.0,
  CONSTRAINT service_requests_pkey PRIMARY KEY (id)
);
CREATE TABLE public.takeoff_works (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project text,
  data_solicitacao date,
  data_estimada_entrega date,
  entrega_real date,
  description text,
  modelo_da_casa text,
  opcionais_da_casa text,
  arquivo_dwg text,
  plano_estrutural text,
  adequacao_dwg text,
  importacao_dwg_mitek text,
  execucao_3d_mitek text,
  lista_materiais_excel text,
  dividir_3d_paineis text,
  validacao_projeto_takeoff text,
  created_at timestamp with time zone DEFAULT now(),
  data_inicio date,
  doc_links text,
  CONSTRAINT takeoff_works_pkey PRIMARY KEY (id)
);
CREATE TABLE public.takeoff_works_responsibles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  step text NOT NULL,
  responsible text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT takeoff_works_responsibles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.telas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  CONSTRAINT telas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.timesheet_analysis (
  id integer NOT NULL DEFAULT nextval('timesheet_analysis_id_seq'::regclass),
  date date,
  nome text,
  error text,
  team text,
  corporation text,
  payrate numeric,
  add_time_hour numeric,
  remove_time_hour numeric,
  add_dollar numeric,
  remove_dollar numeric,
  total numeric,
  CONSTRAINT timesheet_analysis_pkey PRIMARY KEY (id)
);
CREATE TABLE public.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  criado_em timestamp without time zone DEFAULT now(),
  CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);
CREATE TABLE public.usuarios_telas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  tela_id uuid,
  CONSTRAINT usuarios_telas_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_telas_tela_id_fkey FOREIGN KEY (tela_id) REFERENCES public.telas(id),
  CONSTRAINT usuarios_telas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id)
);