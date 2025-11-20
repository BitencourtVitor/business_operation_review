-- Adiciona a coluna Previous Beams Date para armazenar a data de preparação (Beams)
ALTER TABLE public.workforce_projects
ADD COLUMN IF NOT EXISTS previous_beams_date DATE;

-- Índice auxiliar para consultas por Beams Date
CREATE INDEX IF NOT EXISTS idx_workforce_projects_beams_date
  ON public.workforce_projects(previous_beams_date);

