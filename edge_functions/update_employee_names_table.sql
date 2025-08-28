-- Script para atualizar a tabela employee_names com as novas colunas de veículo
-- Execute este script no seu banco de dados Supabase

-- Verificar se as colunas já existem
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'employee_names' 
ORDER BY ordinal_position;

-- Adicionar as novas colunas se elas não existirem
DO $$ 
BEGIN
    -- Adicionar coluna vehicle_model se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employee_names' AND column_name = 'vehicle_model') THEN
        ALTER TABLE public.employee_names ADD COLUMN vehicle_model TEXT NULL;
        RAISE NOTICE 'Coluna vehicle_model adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna vehicle_model já existe';
    END IF;
    
    -- Adicionar coluna vehicle_min_consumption se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employee_names' AND column_name = 'vehicle_min_consumption') THEN
        ALTER TABLE public.employee_names ADD COLUMN vehicle_min_consumption BIGINT NULL;
        RAISE NOTICE 'Coluna vehicle_min_consumption adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna vehicle_min_consumption já existe';
    END IF;
    
    -- Adicionar coluna vehicle_max_consumption se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'employee_names' AND column_name = 'vehicle_max_consumption') THEN
        ALTER TABLE public.employee_names ADD COLUMN vehicle_max_consumption BIGINT NULL;
        RAISE NOTICE 'Coluna vehicle_max_consumption adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna vehicle_max_consumption já existe';
    END IF;
END $$;

-- Adicionar comentários nas novas colunas
COMMENT ON COLUMN public.employee_names.vehicle_model IS 'Modelo do veículo do funcionário';
COMMENT ON COLUMN public.employee_names.vehicle_min_consumption IS 'Consumo mínimo estimado em MPG';
COMMENT ON COLUMN public.employee_names.vehicle_max_consumption IS 'Consumo máximo estimado em MPG';

-- Verificar estrutura final da tabela
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'employee_names' 
ORDER BY ordinal_position;

-- Exemplo de inserção de dados de veículo (opcional)
-- UPDATE public.employee_names 
-- SET vehicle_model = 'Ford F-150',
--     vehicle_min_consumption = 15,
--     vehicle_max_consumption = 20
-- WHERE normalized_name = 'Nome do Funcionário';

-- Verificar dados atuais
SELECT 
    id,
    normalized_name,
    vehicle_model,
    vehicle_min_consumption,
    vehicle_max_consumption
FROM public.employee_names 
LIMIT 10;
