-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  entidade character varying NOT NULL,
  entidade_id uuid NOT NULL,
  acao character varying NOT NULL CHECK (acao::text = ANY (ARRAY['insert'::character varying, 'update'::character varying, 'delete'::character varying]::text[])),
  dados_antes jsonb,
  dados_depois jsonb,
  usuario_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id)
);
CREATE TABLE public.equipe_destinataria (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipe_destinataria_pkey PRIMARY KEY (id)
);
CREATE TABLE public.house_model_products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  house_model_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantidade_limite numeric NOT NULL CHECK (quantidade_limite >= 0::numeric),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT house_model_products_pkey PRIMARY KEY (id),
  CONSTRAINT house_model_products_house_model_id_fkey FOREIGN KEY (house_model_id) REFERENCES public.house_models(id),
  CONSTRAINT house_model_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.house_models (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  CONSTRAINT house_models_pkey PRIMARY KEY (id)
);
CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  ip_address character varying NOT NULL,
  attempts integer DEFAULT 0,
  blocked_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT login_attempts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pessoa_destinataria (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL,
  equipe_destinataria_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pessoa_destinataria_pkey PRIMARY KEY (id),
  CONSTRAINT pessoa_destinataria_equipe_destinataria_id_fkey FOREIGN KEY (equipe_destinataria_id) REFERENCES public.equipe_destinataria(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL UNIQUE,
  unidade_medida character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  saldo_minimo integer NOT NULL DEFAULT 0,
  CONSTRAINT products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL,
  house_model_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_house_model_id_fkey FOREIGN KEY (house_model_id) REFERENCES public.house_models(id)
);
CREATE TABLE public.stock_movement_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  stock_movement_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade <> 0),
  valor_unitario numeric,
  custo_medio_aplicado numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_movement_items_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movement_items_stock_movement_id_fkey FOREIGN KEY (stock_movement_id) REFERENCES public.stock_movements(id),
  CONSTRAINT stock_movement_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.stock_movements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tipo character varying NOT NULL CHECK (tipo::text = ANY (ARRAY['entrada'::character varying, 'saida'::character varying, 'ajuste'::character varying]::text[])),
  project_id uuid,
  usuario_id uuid NOT NULL,
  tipo_origem character varying NOT NULL,
  referencia_externa character varying,
  created_at timestamp with time zone DEFAULT now(),
  destinatario_id uuid,
  supplier character varying,
  supplier_id uuid,
  invoice character varying,
  observacao text,
  tax_rate numeric DEFAULT 6.25,
  movement_date timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
  CONSTRAINT stock_movements_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT stock_movements_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.users(id),
  CONSTRAINT stock_movements_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES public.pessoa_destinataria(id),
  CONSTRAINT stock_movements_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  nome character varying NOT NULL,
  pin_hash character varying NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['admin'::character varying, 'dev'::character varying, 'operador'::character varying, 'comprador'::character varying]::text[])),
  can_view_dashboard boolean DEFAULT false,
  can_create_entry boolean DEFAULT false,
  can_create_exit boolean DEFAULT false,
  can_view_logs boolean DEFAULT false,
  can_manage_users boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  validado boolean DEFAULT true,
  can_view_inventory boolean DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);