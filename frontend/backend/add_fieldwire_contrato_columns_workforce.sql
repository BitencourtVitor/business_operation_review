-- Adicionar colunas Fieldwire e Tem Contrato na tabela workforce_projects
ALTER TABLE public.workforce_projects
  ADD COLUMN IF NOT EXISTS fieldwire BOOLEAN,
  ADD COLUMN IF NOT EXISTS tem_contrato BOOLEAN;

COMMENT ON COLUMN public.workforce_projects.fieldwire IS 'Indica se o projeto já está configurado no Fieldwire';
COMMENT ON COLUMN public.workforce_projects.tem_contrato IS 'Indica se existe contrato formal associado ao projeto';

CREATE INDEX IF NOT EXISTS idx_workforce_projects_fieldwire ON public.workforce_projects(fieldwire);
CREATE INDEX IF NOT EXISTS idx_workforce_projects_tem_contrato ON public.workforce_projects(tem_contrato);

