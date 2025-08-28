-- Script para debugar a tabela employee_names
-- Execute este script no seu banco de dados Supabase

-- 1. Verificar estrutura da tabela
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'employee_names' 
ORDER BY ordinal_position;

-- 2. Verificar se há dados nas novas colunas
SELECT 
    id,
    normalized_name,
    vehicle_model,
    vehicle_min_consumption,
    vehicle_max_consumption,
    CASE 
        WHEN vehicle_model IS NOT NULL THEN 'Tem veículo'
        ELSE 'Sem veículo'
    END as status_veiculo
FROM public.employee_names 
WHERE is_active = true
ORDER BY normalized_name;

-- 3. Contar quantos registros têm dados de veículo
SELECT 
    COUNT(*) as total_registros,
    COUNT(vehicle_model) as com_veiculo,
    COUNT(vehicle_min_consumption) as com_consumo_min,
    COUNT(vehicle_max_consumption) as com_consumo_max
FROM public.employee_names 
WHERE is_active = true;

-- 4. Verificar alguns registros específicos para debug
SELECT 
    id,
    wex_name,
    samsara_name,
    normalized_name,
    vehicle_model,
    vehicle_min_consumption,
    vehicle_max_consumption
FROM public.employee_names 
WHERE is_active = true
LIMIT 5;
