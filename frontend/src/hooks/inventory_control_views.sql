
-- IMPORTANTE: Execute este script no SQL Editor do projeto 'Premium - Storage'
-- (Não execute no projeto Premium - BOR)

-- 1. View: Histórico de Saldo Mensal por Produto
CREATE OR REPLACE VIEW public.vw_historico_saldo_mensal AS
WITH meses AS (
    SELECT generate_series(
        date_trunc('year', NOW()), 
        date_trunc('month', NOW()), 
        '1 month'::interval
    ) AS mes
),
movimentacoes_acumuladas AS (
    SELECT 
        m.mes,
        p.id AS product_id,
        p.nome AS product_nome,
        p.saldo_minimo,
        COALESCE(SUM(
            CASE 
                WHEN sm.tipo = 'entrada' THEN smi.quantidade
                WHEN sm.tipo = 'saida' THEN -smi.quantidade
                WHEN sm.tipo = 'ajuste' THEN smi.quantidade
                ELSE 0
            END
        ), 0) AS saldo_acumulado
    FROM meses m
    CROSS JOIN public.products p
    LEFT JOIN public.stock_movements sm ON date_trunc('month', sm.movement_date) <= m.mes
    LEFT JOIN public.stock_movement_items smi ON sm.id = smi.stock_movement_id AND smi.product_id = p.id
    GROUP BY m.mes, p.id, p.nome, p.saldo_minimo
)
SELECT 
    mes,
    product_id,
    product_nome,
    saldo_minimo,
    saldo_acumulado,
    CASE WHEN saldo_acumulado < saldo_minimo THEN true ELSE false END AS abaixo_minimo
FROM movimentacoes_acumuladas;

-- 2. View: Detalhes de Excesso
CREATE OR REPLACE VIEW public.vw_detalhes_excesso_limite AS
SELECT 
    pr.id AS project_id,
    pr.nome AS project_nome,
    hm.nome AS house_model_nome,
    p.nome AS product_nome,
    u.nome AS usuario_responsavel,
    sm.movement_date,
    smi.quantidade AS quantidade_retirada,
    hmp.quantidade_limite,
    (
        SELECT SUM(smi2.quantidade)
        FROM public.stock_movement_items smi2
        JOIN public.stock_movements sm2 ON smi2.stock_movement_id = sm2.id
        WHERE sm2.project_id = pr.id 
          AND smi2.product_id = p.id
          AND sm2.tipo = 'saida'
          AND sm2.created_at <= sm.created_at
    ) AS consumo_acumulado_momento,
    CASE 
        WHEN (
            SELECT SUM(smi2.quantidade)
            FROM public.stock_movement_items smi2
            JOIN public.stock_movements sm2 ON smi2.stock_movement_id = sm2.id
            WHERE sm2.project_id = pr.id 
              AND smi2.product_id = p.id
              AND sm2.tipo = 'saida'
              AND sm2.created_at <= sm.created_at
        ) > hmp.quantidade_limite THEN true
        ELSE false
    END AS excedeu_neste_momento
FROM public.stock_movements sm
JOIN public.stock_movement_items smi ON sm.id = smi.stock_movement_id
JOIN public.projects pr ON sm.project_id = pr.id
JOIN public.house_models hm ON pr.house_model_id = hm.id
JOIN public.products p ON smi.product_id = p.id
JOIN public.house_model_products hmp ON hm.id = hmp.house_model_id AND p.id = hmp.product_id
JOIN public.users u ON sm.usuario_id = u.id
WHERE sm.tipo = 'saida';

-- 3. View: Gasto por Usuário
CREATE OR REPLACE VIEW public.vw_gasto_por_usuario AS
SELECT 
    u.id AS usuario_id,
    u.nome AS usuario_nome,
    u.role,
    date_trunc('month', sm.movement_date) AS mes,
    COUNT(DISTINCT sm.id) AS total_retiradas,
    SUM(smi.quantidade * COALESCE(smi.custo_medio_aplicado, smi.valor_unitario, 0)) AS valor_total_retirado
FROM public.stock_movements sm
JOIN public.stock_movement_items smi ON sm.id = smi.stock_movement_id
JOIN public.users u ON sm.usuario_id = u.id
WHERE sm.tipo = 'saida'
GROUP BY u.id, u.nome, u.role, date_trunc('month', sm.movement_date);

-- Permissões
GRANT SELECT ON public.vw_historico_saldo_mensal TO anon, authenticated;
GRANT SELECT ON public.vw_detalhes_excesso_limite TO anon, authenticated;
GRANT SELECT ON public.vw_gasto_por_usuario TO anon, authenticated;
