-- Tabela principal: forecast_data (planilha Data, GID=0)
create table public.forecast_data (
  id text not null,
  cliente text not null,
  job_site text not null,
  type text null,
  lote_bld text null,
  status text null,
  address text null,
  workforce text null,
  previous_beams_date date null,
  previous_start_date date null,
  previous_end_date date null,
  obs text null,
  hvac boolean null,
  buildertrend boolean null,
  machine_provider text null,
  create_datetime timestamp with time zone null,
  lastupdate_datetimez timestamp with time zone null,
  constraint forecast_data_pkey primary key (id)
) TABLESPACE pg_default;

-- Índices para forecast_data
create index if not exists idx_forecast_data_cliente on public.forecast_data using btree (cliente) TABLESPACE pg_default;
create index if not exists idx_forecast_data_job_site on public.forecast_data using btree (job_site) TABLESPACE pg_default;
create index if not exists idx_forecast_data_status on public.forecast_data using btree (status) TABLESPACE pg_default;
create index if not exists idx_forecast_data_hvac on public.forecast_data using btree (hvac) TABLESPACE pg_default;
create index if not exists idx_forecast_data_buildertrend on public.forecast_data using btree (buildertrend) TABLESPACE pg_default;
create index if not exists idx_forecast_data_dates on public.forecast_data using btree (previous_beams_date, previous_start_date, previous_end_date) TABLESPACE pg_default;

-- Tabela: forecast_fieldwire (planilha Fieldwire, GID=187846874)
create table public.forecast_fieldwire (
  id bigserial not null,
  obra_id text not null,
  category text null,
  document text null,
  status boolean null,
  lastupdate_datetimez timestamp with time zone null,
  constraint forecast_fieldwire_pkey primary key (id),
  constraint forecast_fieldwire_obra_id_fkey foreign key (obra_id) references public.forecast_data(id) on delete cascade
) TABLESPACE pg_default;

-- Índices para forecast_fieldwire
create index if not exists idx_forecast_fieldwire_obra_id on public.forecast_fieldwire using btree (obra_id) TABLESPACE pg_default;
create index if not exists idx_forecast_fieldwire_status on public.forecast_fieldwire using btree (status) TABLESPACE pg_default;
create index if not exists idx_forecast_fieldwire_category on public.forecast_fieldwire using btree (category) TABLESPACE pg_default;

-- Tabela: forecast_machines (planilha Machines, GID=1720524266)
create table public.forecast_machines (
  id bigserial not null,
  obra_id text not null,
  category text null,
  subcategory text null,
  equipment_category text null,
  title text null,
  status boolean null,
  unit text null,
  lastupdate_datetimez timestamp with time zone null,
  constraint forecast_machines_pkey primary key (id),
  constraint forecast_machines_obra_id_fkey foreign key (obra_id) references public.forecast_data(id) on delete cascade
) TABLESPACE pg_default;

-- Índices para forecast_machines
create index if not exists idx_forecast_machines_obra_id on public.forecast_machines using btree (obra_id) TABLESPACE pg_default;
create index if not exists idx_forecast_machines_status on public.forecast_machines using btree (status) TABLESPACE pg_default;
create index if not exists idx_forecast_machines_category on public.forecast_machines using btree (category) TABLESPACE pg_default;
create index if not exists idx_forecast_machines_equipment_category on public.forecast_machines using btree (equipment_category) TABLESPACE pg_default;

-- Tabela: forecast_contract_steps (planilha ContractSteps, GID=1936634959)
create table public.forecast_contract_steps (
  id bigserial not null,
  obra_id text not null,
  step text null,
  status boolean null,
  lastupdate_datetimez timestamp with time zone null,
  constraint forecast_contract_steps_pkey primary key (id),
  constraint forecast_contract_steps_obra_id_fkey foreign key (obra_id) references public.forecast_data(id) on delete cascade
) TABLESPACE pg_default;

-- Índices para forecast_contract_steps
create index if not exists idx_forecast_contract_steps_obra_id on public.forecast_contract_steps using btree (obra_id) TABLESPACE pg_default;
create index if not exists idx_forecast_contract_steps_status on public.forecast_contract_steps using btree (status) TABLESPACE pg_default;
create index if not exists idx_forecast_contract_steps_step on public.forecast_contract_steps using btree (step) TABLESPACE pg_default;
