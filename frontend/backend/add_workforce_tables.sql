-- Criar tabela workforce_projects
CREATE TABLE IF NOT EXISTS public.workforce_projects (
  id SERIAL PRIMARY KEY,
  cliente TEXT NOT NULL,
  job_site TEXT NOT NULL,
  type TEXT,
  lote_building INTEGER DEFAULT 0,
  workforce TEXT,
  previous_start_date DATE,
  previous_end_date DATE,
  previous_beams_date DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela workforce_groups
CREATE TABLE IF NOT EXISTS public.workforce_groups (
  id SERIAL PRIMARY KEY,
  grupo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  especialidade TEXT,
  capacidade INTEGER DEFAULT 0,
  contato TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_workforce_projects_cliente ON public.workforce_projects(cliente);
CREATE INDEX IF NOT EXISTS idx_workforce_projects_job_site ON public.workforce_projects(job_site);
CREATE INDEX IF NOT EXISTS idx_workforce_projects_type ON public.workforce_projects(type);
CREATE INDEX IF NOT EXISTS idx_workforce_projects_dates ON public.workforce_projects(previous_start_date, previous_end_date);
CREATE INDEX IF NOT EXISTS idx_workforce_projects_beams_date ON public.workforce_projects(previous_beams_date);

CREATE INDEX IF NOT EXISTS idx_workforce_groups_grupo ON public.workforce_groups(grupo);
CREATE INDEX IF NOT EXISTS idx_workforce_groups_categoria ON public.workforce_groups(categoria);

-- Comentários para documentação
COMMENT ON TABLE public.workforce_projects IS 'Tabela para armazenar projetos de workforce/forecast';
COMMENT ON COLUMN public.workforce_projects.type IS 'Tipo do projeto: Lot ou Building';
COMMENT ON COLUMN public.workforce_projects.lote_building IS 'Número do lote ou building';
COMMENT ON COLUMN public.workforce_projects.workforce IS 'Equipe responsável pelo projeto';
COMMENT ON COLUMN public.workforce_projects.previous_beams_date IS 'Data da etapa de Beams/Pré-obra';

COMMENT ON TABLE public.workforce_groups IS 'Tabela para armazenar grupos de workforce';
COMMENT ON COLUMN public.workforce_groups.capacidade IS 'Capacidade do grupo em número de pessoas';

