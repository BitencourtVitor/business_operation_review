-- Tabela para armazenar o histórico de eventos e performance de subcontratados
CREATE TABLE IF NOT EXISTS public.subcontractor_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id TEXT NOT NULL, -- ID da obra vindo do Forecast
    event TEXT NOT NULL, -- Ex: "not started -> open" ou "open -> closed"
    estimated_date_type TEXT NOT NULL, -- "Start" ou "End"
    subcontractor TEXT, -- Nome da equipe/empresa
    event_datetime TIMESTAMP WITH TIME ZONE, -- Data/hora em que o evento ocorreu na planilha
    user_email TEXT, -- Email de quem gerou o evento
    
    -- Metadados do sistema
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que a constraint única exista (para o ON CONFLICT funcionar)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_sub_event') THEN
        ALTER TABLE public.subcontractor_performance 
        ADD CONSTRAINT unique_sub_event UNIQUE (obra_id, event, event_datetime);
    END IF;
END $$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sub_perf_obra_id ON public.subcontractor_performance(obra_id);
CREATE INDEX IF NOT EXISTS idx_sub_perf_event_datetime ON public.subcontractor_performance(event_datetime);

-- Atualização da Monthly Execution History para suportar os novos dados
ALTER TABLE public.monthly_execution_history 
ADD COLUMN IF NOT EXISTS subcontractor TEXT,
ADD COLUMN IF NOT EXISTS actual_end_date DATE,
ADD COLUMN IF NOT EXISTS is_cycle_completed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.monthly_execution_history.subcontractor IS 'Subcontratado capturado via Subcontractor Performance no momento do fechamento';
COMMENT ON COLUMN public.monthly_execution_history.is_cycle_completed IS 'Indica se a obra iniciou e terminou dentro do mesmo mês de referência';
