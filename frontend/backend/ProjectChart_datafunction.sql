-- Função SQL para ProjectChart - VERSÃO SIMPLIFICADA E CORRIGIDA
-- Foco: Trazer dados de receivables e payables de forma simples e confiável

-- Remover função existente primeiro
DROP FUNCTION IF EXISTS get_project_chart_data(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_project_chart_data(
  p_selected_year TEXT DEFAULT NULL,
  p_selected_month TEXT DEFAULT NULL
)
RETURNS TABLE (
  period_label TEXT,
  receivable_amount NUMERIC,
  payable_amount NUMERIC,
  pending_receivable_amount NUMERIC,
  pending_payable_amount NUMERIC
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_period TEXT;
BEGIN
  -- Determinar o período baseado nos filtros
  IF p_selected_year IS NOT NULL AND p_selected_month IS NOT NULL THEN
    v_period := 'day';
  ELSIF p_selected_year IS NOT NULL THEN
    v_period := 'month';
  ELSE
    v_period := 'month';
  END IF;

  RETURN QUERY
  WITH all_transactions AS (
    -- RECEIVABLES: hvac_payments (o que foi recebido)
    SELECT 
      'receivable' AS type,
      txn_date,
      total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM txn_date)::TEXT || '/' || EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
      END AS period_key
    FROM hvac_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND (p_selected_year IS NULL OR EXTRACT(YEAR FROM txn_date)::TEXT = p_selected_year)
      AND (p_selected_month IS NULL OR EXTRACT(MONTH FROM txn_date) = p_selected_month::INTEGER)
    
    UNION ALL
    
    -- PAYABLES: hvac_bill_payments (pagamentos reais já feitos)
    SELECT 
      'payable' AS type,
      txn_date,
      total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM txn_date)::TEXT || '/' || EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
      END AS period_key
    FROM hvac_bill_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND (p_selected_year IS NULL OR EXTRACT(YEAR FROM txn_date)::TEXT = p_selected_year)
      AND (p_selected_month IS NULL OR EXTRACT(MONTH FROM txn_date) = p_selected_month::INTEGER)
  ),
  
  -- Agrupar por período
  grouped_data AS (
    SELECT 
      period_key,
      SUM(CASE WHEN type = 'receivable' THEN total_amount ELSE 0 END) AS receivable_amount,
      SUM(CASE WHEN type = 'payable' THEN total_amount ELSE 0 END) AS payable_amount
    FROM all_transactions
    GROUP BY period_key
  )
  
  -- Resultado final
  SELECT 
    gd.period_key AS period_label,
    COALESCE(gd.receivable_amount, 0)::NUMERIC AS receivable_amount,
    COALESCE(gd.payable_amount, 0)::NUMERIC AS payable_amount,
    0::NUMERIC AS pending_receivable_amount, -- Será calculado via JavaScript
    0::NUMERIC AS pending_payable_amount     -- Será calculado via JavaScript
  FROM grouped_data gd
  ORDER BY 
    CASE 
      WHEN v_period = 'month' THEN 
        (SPLIT_PART(gd.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(gd.period_key, '/', 1)::INTEGER)
      WHEN v_period = 'day' THEN 
        (SPLIT_PART(gd.period_key, '/', 3)::INTEGER * 10000 + SPLIT_PART(gd.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(gd.period_key, '/', 1)::INTEGER)
      ELSE 
        gd.period_key::INTEGER
    END;
END;
$$;

-- Função SQL para Framing (versão corrigida usando a mesma lógica da HVAC)
DROP FUNCTION IF EXISTS get_framing_project_chart_data(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_framing_project_chart_data(
  p_selected_year TEXT DEFAULT NULL,
  p_selected_month TEXT DEFAULT NULL
)
RETURNS TABLE (
  period_label TEXT,
  receivable_amount NUMERIC,
  payable_amount NUMERIC,
  pending_receivable_amount NUMERIC,
  pending_payable_amount NUMERIC
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_period TEXT;
BEGIN
  -- Determinar período baseado nos filtros
  IF p_selected_year IS NOT NULL AND p_selected_month IS NOT NULL THEN
    v_period := 'day';
  ELSIF p_selected_year IS NOT NULL THEN
    v_period := 'month';
  ELSE
    v_period := 'month';
  END IF;

  RETURN QUERY
  WITH all_transactions AS (
    -- RECEIVABLES: framing_payments (o que foi recebido)
    SELECT 
      'receivable' AS type,
      txn_date,
      total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM txn_date)::TEXT || '/' || EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
      END AS period_key
    FROM framing_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND (p_selected_year IS NULL OR EXTRACT(YEAR FROM txn_date)::TEXT = p_selected_year)
      AND (p_selected_month IS NULL OR EXTRACT(MONTH FROM txn_date) = p_selected_month::INTEGER)
    
    UNION ALL
    
    -- PAYABLES: framing_bill_payments (pagamentos reais já feitos)
    SELECT 
      'payable' AS type,
      txn_date,
      total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM txn_date)::TEXT || '/' || EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
      END AS period_key
    FROM framing_bill_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND (p_selected_year IS NULL OR EXTRACT(YEAR FROM txn_date)::TEXT = p_selected_year)
      AND (p_selected_month IS NULL OR EXTRACT(MONTH FROM txn_date) = p_selected_month::INTEGER)
  ),
  
  -- Agrupar por período
  grouped_data AS (
    SELECT 
      period_key,
      SUM(CASE WHEN type = 'receivable' THEN total_amount ELSE 0 END) AS receivable_amount,
      SUM(CASE WHEN type = 'payable' THEN total_amount ELSE 0 END) AS payable_amount
    FROM all_transactions
    GROUP BY period_key
  )
  
  -- Resultado final
  SELECT 
    gd.period_key AS period_label,
    COALESCE(gd.receivable_amount, 0)::NUMERIC AS receivable_amount,
    COALESCE(gd.payable_amount, 0)::NUMERIC AS payable_amount,
    0::NUMERIC AS pending_receivable_amount, -- Será calculado via JavaScript
    0::NUMERIC AS pending_payable_amount     -- Será calculado via JavaScript
  FROM grouped_data gd
  ORDER BY 
    CASE 
      WHEN v_period = 'month' THEN 
        (SPLIT_PART(gd.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(gd.period_key, '/', 1)::INTEGER)
      WHEN v_period = 'day' THEN 
        (SPLIT_PART(gd.period_key, '/', 3)::INTEGER * 10000 + SPLIT_PART(gd.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(gd.period_key, '/', 1)::INTEGER)
      ELSE 
        gd.period_key::INTEGER
    END;
END;
$$;

-- Função SQL para Framing (versão simplificada para teste de mês)
DROP FUNCTION IF EXISTS get_framing_project_chart_data_simple(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_framing_project_chart_data_simple(
  p_selected_year TEXT DEFAULT NULL,
  p_selected_month TEXT DEFAULT NULL
)
RETURNS TABLE (
  period_label TEXT,
  receivable_amount NUMERIC,
  payable_amount NUMERIC,
  pending_receivable_amount NUMERIC,
  pending_payable_amount NUMERIC
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    '01/2025' AS period_label,
    COALESCE(SUM(CASE WHEN t.type = 'receivable' THEN t.total_amount ELSE 0 END), 0)::NUMERIC AS receivable_amount,
    COALESCE(SUM(CASE WHEN t.type = 'payable' THEN t.total_amount ELSE 0 END), 0)::NUMERIC AS payable_amount,
    0::NUMERIC AS pending_receivable_amount,
    0::NUMERIC AS pending_payable_amount
  FROM (
    -- RECEIVABLES: framing_payments
    SELECT 'receivable' AS type, total_amount
    FROM framing_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND EXTRACT(YEAR FROM txn_date)::TEXT = '2025'
      AND EXTRACT(MONTH FROM txn_date)::TEXT = '01'
    
    UNION ALL
    
    -- PAYABLES: framing_bill_payments
    SELECT 'payable' AS type, total_amount
    FROM framing_bill_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND EXTRACT(YEAR FROM txn_date)::TEXT = '2025'
      AND EXTRACT(MONTH FROM txn_date)::TEXT = '01'
    
    UNION ALL
    
    -- PAYABLES: framing_purchases
    SELECT 'payable' AS type, total_amount
    FROM framing_purchases
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND EXTRACT(YEAR FROM txn_date)::TEXT = '2025'
      AND EXTRACT(MONTH FROM txn_date)::TEXT = '01'
    
    UNION ALL
    
    -- PAYABLES: framing_vendor_credits
    SELECT 'payable' AS type, -total_amount
    FROM framing_vendor_credits
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND EXTRACT(YEAR FROM txn_date)::TEXT = '2025'
      AND EXTRACT(MONTH FROM txn_date)::TEXT = '01'
  ) t;
END;
$$;

-- Função SQL para PCG (mesma estrutura que HVAC e Framing)
DROP FUNCTION IF EXISTS get_pcg_project_chart_data(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_pcg_project_chart_data(
  p_selected_year TEXT DEFAULT NULL,
  p_selected_month TEXT DEFAULT NULL
)
RETURNS TABLE (
  period_label TEXT,
  receivable_amount NUMERIC,
  payable_amount NUMERIC,
  pending_receivable_amount NUMERIC,
  pending_payable_amount NUMERIC
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_period TEXT;
BEGIN
  -- Determinar período baseado nos filtros
  IF p_selected_year IS NOT NULL AND p_selected_month IS NOT NULL THEN
    v_period := 'day';
  ELSIF p_selected_year IS NOT NULL THEN
    v_period := 'month';
  ELSE
    v_period := 'month';
  END IF;

  RETURN QUERY
  WITH all_transactions AS (
    -- RECEIVABLES: pcg_payments (o que foi recebido)
    SELECT 
      'receivable' AS type,
      txn_date,
      total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM txn_date)::TEXT || '/' || EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
      END AS period_key
    FROM pcg_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND (p_selected_year IS NULL OR EXTRACT(YEAR FROM txn_date)::TEXT = p_selected_year)
      AND (p_selected_month IS NULL OR EXTRACT(MONTH FROM txn_date) = p_selected_month::INTEGER)
    
    UNION ALL
    
    -- PAYABLES: pcg_bill_payments (pagamentos reais já feitos)
    SELECT 
      'payable' AS type,
      txn_date,
      total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM txn_date)::TEXT || '/' || EXTRACT(MONTH FROM txn_date)::TEXT || '/' || EXTRACT(YEAR FROM txn_date)::TEXT
      END AS period_key
    FROM pcg_bill_payments
    WHERE txn_date IS NOT NULL 
      AND total_amount IS NOT NULL
      AND total_amount > 0
      AND (p_selected_year IS NULL OR EXTRACT(YEAR FROM txn_date)::TEXT = p_selected_year)
      AND (p_selected_month IS NULL OR EXTRACT(MONTH FROM txn_date) = p_selected_month::INTEGER)
  ),
  
  -- Agrupar por período
  grouped_data AS (
    SELECT 
      period_key,
      SUM(CASE WHEN type = 'receivable' THEN total_amount ELSE 0 END) AS receivable_amount,
      SUM(CASE WHEN type = 'payable' THEN total_amount ELSE 0 END) AS payable_amount
    FROM all_transactions
    GROUP BY period_key
  )
  
  -- Resultado final
  SELECT 
    gd.period_key AS period_label,
    COALESCE(gd.receivable_amount, 0)::NUMERIC AS receivable_amount,
    COALESCE(gd.payable_amount, 0)::NUMERIC AS payable_amount,
    0::NUMERIC AS pending_receivable_amount, -- Será calculado via JavaScript
    0::NUMERIC AS pending_payable_amount     -- Será calculado via JavaScript
  FROM grouped_data gd
  ORDER BY 
    CASE 
      WHEN v_period = 'month' THEN 
        (SPLIT_PART(gd.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(gd.period_key, '/', 1)::INTEGER)
      WHEN v_period = 'day' THEN 
        (SPLIT_PART(gd.period_key, '/', 3)::INTEGER * 10000 + SPLIT_PART(gd.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(gd.period_key, '/', 1)::INTEGER)
      ELSE 
        gd.period_key::INTEGER
    END;
END;
$$;