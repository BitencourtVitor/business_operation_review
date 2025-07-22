-- Função SQL para processar dados do ProjectChart replicando exatamente a lógica do JavaScript
-- Inclui agrupamento por período (year/month/day), filtros e cálculo de pendências

CREATE OR REPLACE FUNCTION get_project_chart_data(
  p_selected_year TEXT DEFAULT NULL,
  p_selected_month TEXT DEFAULT NULL,
  p_selected_group TEXT DEFAULT 'all'
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
  v_year TEXT;
  v_month TEXT;
BEGIN
  -- Determinar período baseado nos filtros (igual ao JavaScript)
  IF p_selected_year IS NOT NULL AND p_selected_month IS NOT NULL THEN
    v_period := 'day';
  ELSIF p_selected_year IS NOT NULL THEN
    v_period := 'month';
  ELSE
    v_period := 'month';
  END IF;

  -- Extrair ano e mês dos parâmetros
  v_year := p_selected_year;
  v_month := p_selected_month;

  RETURN QUERY
  WITH period_data AS (
    -- Dados de receivables (hvac_payments)
    SELECT 
      'receivable' AS data_type,
      p.txn_date,
      p.total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM p.txn_date::DATE)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM p.txn_date::DATE)::TEXT || '/' || EXTRACT(YEAR FROM p.txn_date::DATE)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM p.txn_date::DATE)::TEXT || '/' || EXTRACT(MONTH FROM p.txn_date::DATE)::TEXT || '/' || EXTRACT(YEAR FROM p.txn_date::DATE)::TEXT
      END AS period_key
    FROM hvac_payments p
    WHERE p.txn_date IS NOT NULL 
      AND p.total_amount > 0
      AND (v_year IS NULL OR EXTRACT(YEAR FROM p.txn_date::DATE)::TEXT = v_year)
      AND (v_month IS NULL OR EXTRACT(MONTH FROM p.txn_date::DATE) = v_month::INTEGER)
    
    UNION ALL
    
    -- Dados de payables (hvac_bill_payments)
    SELECT 
      'payable' AS data_type,
      bp.txn_date,
      bp.total_amount,
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM bp.txn_date::DATE)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM bp.txn_date::DATE)::TEXT || '/' || EXTRACT(YEAR FROM bp.txn_date::DATE)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM bp.txn_date::DATE)::TEXT || '/' || EXTRACT(MONTH FROM bp.txn_date::DATE)::TEXT || '/' || EXTRACT(YEAR FROM bp.txn_date::DATE)::TEXT
      END AS period_key
    FROM hvac_bill_payments bp
    WHERE bp.txn_date IS NOT NULL 
      AND bp.total_amount > 0
      AND (v_year IS NULL OR EXTRACT(YEAR FROM bp.txn_date::DATE)::TEXT = v_year)
      AND (v_month IS NULL OR EXTRACT(MONTH FROM bp.txn_date::DATE) = v_month::INTEGER)
  ),
  
  -- Agrupar dados por período (igual ao JavaScript)
  grouped_data AS (
    SELECT 
      period_key,
      SUM(CASE WHEN data_type = 'receivable' THEN total_amount ELSE 0 END) AS receivable_amount,
      SUM(CASE WHEN data_type = 'payable' THEN total_amount ELSE 0 END) AS payable_amount
    FROM period_data
    GROUP BY period_key
  ),
  
  -- Calcular pendências (replicando a lógica do JavaScript)
  pending_data AS (
    -- Pendências receivables
    SELECT 
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM ra.date_field::DATE)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM ra.date_field::DATE)::TEXT || '/' || EXTRACT(YEAR FROM ra.date_field::DATE)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM ra.date_field::DATE)::TEXT || '/' || EXTRACT(MONTH FROM ra.date_field::DATE)::TEXT || '/' || EXTRACT(YEAR FROM ra.date_field::DATE)::TEXT
      END AS period_key,
      'receivable' AS pending_type,
      ra.inv_num AS transaction_id,
      ra.open_balance,
      ra.date_field
    FROM receivables_accounting ra
    WHERE ra.inv_num IS NOT NULL 
      AND ra.open_balance > 0
      AND ra.date_field IS NOT NULL
      AND (v_year IS NULL OR EXTRACT(YEAR FROM ra.date_field::DATE)::TEXT = v_year)
      AND (v_month IS NULL OR EXTRACT(MONTH FROM ra.date_field::DATE) = v_month::INTEGER)
    
    UNION ALL
    
    -- Pendências payables
    SELECT 
      CASE 
        WHEN v_period = 'year' THEN EXTRACT(YEAR FROM pa.date_field::DATE)::TEXT
        WHEN v_period = 'month' THEN EXTRACT(MONTH FROM pa.date_field::DATE)::TEXT || '/' || EXTRACT(YEAR FROM pa.date_field::DATE)::TEXT
        WHEN v_period = 'day' THEN EXTRACT(DAY FROM pa.date_field::DATE)::TEXT || '/' || EXTRACT(MONTH FROM pa.date_field::DATE)::TEXT || '/' || EXTRACT(YEAR FROM pa.date_field::DATE)::TEXT
      END AS period_key,
      'payable' AS pending_type,
      pa.bill_num AS transaction_id,
      pa.open_balance,
      pa.date_field
    FROM payables_accounting pa
    WHERE pa.bill_num IS NOT NULL 
      AND pa.open_balance > 0
      AND pa.date_field IS NOT NULL
      AND (v_year IS NULL OR EXTRACT(YEAR FROM pa.date_field::DATE)::TEXT = v_year)
      AND (v_month IS NULL OR EXTRACT(MONTH FROM pa.date_field::DATE) = v_month::INTEGER)
  ),
  
  -- Calcular menor open_balance por transação (igual ao JavaScript)
  min_pending_by_transaction AS (
    SELECT 
      period_key,
      pending_type,
      transaction_id,
      MIN(open_balance) AS min_open_balance
    FROM pending_data
    GROUP BY period_key, pending_type, transaction_id
  ),
  
  -- Agrupar pendências por período
  grouped_pending AS (
    SELECT 
      period_key,
      SUM(CASE WHEN pending_type = 'receivable' THEN min_open_balance ELSE 0 END) AS pending_receivable_amount,
      SUM(CASE WHEN pending_type = 'payable' THEN min_open_balance ELSE 0 END) AS pending_payable_amount
    FROM min_pending_by_transaction
    GROUP BY period_key
  ),
  
  -- Combinar todos os períodos únicos
  all_periods AS (
    SELECT DISTINCT period_key FROM grouped_data
    UNION
    SELECT DISTINCT period_key FROM grouped_pending
  )
  
  -- Resultado final ordenado
  SELECT 
    ap.period_key AS period_label,
    COALESCE(gd.receivable_amount, 0) AS receivable_amount,
    COALESCE(gd.payable_amount, 0) AS payable_amount,
    COALESCE(gp.pending_receivable_amount, 0) AS pending_receivable_amount,
    COALESCE(gp.pending_payable_amount, 0) AS pending_payable_amount
  FROM all_periods ap
  LEFT JOIN grouped_data gd ON gd.period_key = ap.period_key
  LEFT JOIN grouped_pending gp ON gp.period_key = ap.period_key
  ORDER BY 
    CASE 
      WHEN v_period = 'month' THEN 
        (SPLIT_PART(ap.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(ap.period_key, '/', 1)::INTEGER)
      WHEN v_period = 'day' THEN 
        (SPLIT_PART(ap.period_key, '/', 3)::INTEGER * 10000 + SPLIT_PART(ap.period_key, '/', 2)::INTEGER * 100 + SPLIT_PART(ap.period_key, '/', 1)::INTEGER)
      ELSE 
        ap.period_key::INTEGER
    END;
END;
$$;