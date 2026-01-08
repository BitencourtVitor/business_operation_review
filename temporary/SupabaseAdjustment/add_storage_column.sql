-- Migration: Adicionar coluna storage na tabela forecast_data
-- Data: 2025-01-XX
-- Descrição: Adiciona campo booleano storage para indicar se a obra já foi adicionada ao sistema de estoque

-- Adicionar coluna storage
ALTER TABLE public.forecast_data 
ADD COLUMN IF NOT EXISTS storage boolean NULL;

-- Adicionar índice para melhor performance em consultas filtradas por storage
CREATE INDEX IF NOT EXISTS idx_forecast_data_storage 
ON public.forecast_data USING btree (storage) 
TABLESPACE pg_default;

-- Comentário na coluna para documentação
COMMENT ON COLUMN public.forecast_data.storage IS 'Indica se a obra já foi adicionada ao sistema de estoque (Premium Storage)';
