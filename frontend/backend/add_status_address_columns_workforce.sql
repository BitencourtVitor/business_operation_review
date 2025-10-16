-- Adicionar colunas Status e Address na tabela workforce_projects
ALTER TABLE public.workforce_projects 
ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE public.workforce_projects 
ADD COLUMN IF NOT EXISTS address TEXT;

-- Documentação
COMMENT ON COLUMN public.workforce_projects.status IS 'Status textual do projeto (ex: Planned/In Progress/Completed)';
COMMENT ON COLUMN public.workforce_projects.address IS 'Endereço textual do projeto';

-- Índices opcionais (caso sejam usados em filtros)
CREATE INDEX IF NOT EXISTS idx_workforce_projects_status ON public.workforce_projects(status);
CREATE INDEX IF NOT EXISTS idx_workforce_projects_address ON public.workforce_projects(address);


