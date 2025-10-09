-- Adicionar coluna HVAC na tabela workforce_projects
ALTER TABLE public.workforce_projects 
ADD COLUMN IF NOT EXISTS hvac TEXT;

-- Adicionar comentário para documentação
COMMENT ON COLUMN public.workforce_projects.hvac IS 'Informações sobre HVAC do projeto';

-- Adicionar índice para melhor performance (opcional)
CREATE INDEX IF NOT EXISTS idx_workforce_projects_hvac ON public.workforce_projects(hvac);
