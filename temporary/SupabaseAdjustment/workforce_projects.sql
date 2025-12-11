create table public.workforce_projects (
  id bigserial not null,
  cliente character varying(255) not null,
  job_site character varying(255) not null,
  lote_building integer null default 0,
  workforce character varying(255) null,
  previous_start_date date null,
  previous_end_date date null,
  observacoes text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  type text null,
  hvac text null,
  status text null,
  address text null,
  fieldwire boolean null,
  tem_contrato boolean null,
  previous_beams_date date null,
  constraint workforce_projects_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_hvac on public.workforce_projects using btree (hvac) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_fieldwire on public.workforce_projects using btree (fieldwire) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_tem_contrato on public.workforce_projects using btree (tem_contrato) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_beams_date on public.workforce_projects using btree (previous_beams_date) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_status on public.workforce_projects using btree (status) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_address on public.workforce_projects using btree (address) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_cliente on public.workforce_projects using btree (cliente) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_job_site on public.workforce_projects using btree (job_site) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_workforce on public.workforce_projects using btree (workforce) TABLESPACE pg_default;

create index IF not exists idx_workforce_projects_dates on public.workforce_projects using btree (previous_start_date, previous_end_date) TABLESPACE pg_default;