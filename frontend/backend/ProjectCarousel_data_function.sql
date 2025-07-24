-- Função SQL para alimentar o carrossel de projetos com Expenses unificadas
-- Inclui Bills, Purchases e Vendor Credits como uma entidade "Expenses"
-- Replica exatamente a lógica complexa do JavaScript com todas as relações entre tabelas

-- Remover função existente primeiro
DROP FUNCTION IF EXISTS get_project_carousel_data(DATE, DATE, BOOLEAN);

CREATE OR REPLACE FUNCTION get_project_carousel_data(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_only_accepted BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  estimate_id TEXT,
  project_name TEXT,
  customer_id TEXT,
  status TEXT,
  estimate_date DATE,
  estimate_total NUMERIC,
  expense_count INTEGER,
  expense_total NUMERIC,
  invoice_count INTEGER,
  invoice_total NUMERIC,
  payments_made_count INTEGER,
  payments_made_total NUMERIC,
  payments_received_count INTEGER,
  payments_received_total NUMERIC
) 
LANGUAGE sql
AS $$
WITH 
-- 1. Filtrar estimates baseado nos critérios
filtered_estimates AS (
  SELECT 
    e.id, 
    e.customer_name, 
    e.customer_id, 
    e.txn_status, 
    e.txn_date, 
    e.total_amount,
    e.external_id
  FROM hvac_estimates e
  WHERE (p_only_accepted IS FALSE OR e.txn_status = 'Accepted')
    AND (p_date_from IS NULL OR e.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR e.txn_date <= p_date_to)
),

-- 2. Buscar bill_lines relacionadas aos estimates (mesmo customer_id OU customer_name)
bill_lines_for_estimates AS (
  SELECT DISTINCT
    e.id AS estimate_id,
    bl.id AS bill_line_id,
    bl.bill_id,
    bl.customer_id,
    bl.customer_name,
    bl.amount
  FROM filtered_estimates e
  INNER JOIN hvac_bill_lines bl ON (
    (bl.customer_id IS NOT NULL AND bl.customer_id = e.customer_id) OR
    (bl.customer_name IS NOT NULL AND bl.customer_name = e.customer_name)
  )
  WHERE (p_date_from IS NULL OR bl.customer_id IS NOT NULL) -- Simplificar filtro de data
),

-- 3. Buscar bills relacionadas às bill_lines
bills_for_estimates AS (
  SELECT DISTINCT
    ble.estimate_id,
    b.id AS bill_id,
    b.doc_number,
    b.external_id,
    b.total_amount,
    b.txn_date,
    'bill' AS expense_type
  FROM bill_lines_for_estimates ble
  INNER JOIN hvac_bills b ON b.id = ble.bill_id
  WHERE (p_date_from IS NULL OR b.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR b.txn_date <= p_date_to)
),

-- 4. Buscar purchases relacionadas aos estimates (mesmo customer_id OU customer_name)
purchases_for_estimates AS (
  SELECT DISTINCT
    e.id AS estimate_id,
    p.id AS purchase_id,
    p.external_id,
    p.total_amount,
    p.txn_date,
    'purchase' AS expense_type
  FROM filtered_estimates e
  INNER JOIN hvac_purchase_lines pl ON (
    (pl.customer_id IS NOT NULL AND pl.customer_id = e.customer_id) OR
    (pl.customer_name IS NOT NULL AND pl.customer_name = e.customer_name)
  )
  INNER JOIN hvac_purchases p ON p.id = pl.purchase_id
  WHERE (p_date_from IS NULL OR p.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR p.txn_date <= p_date_to)
),

-- 5. Buscar vendor credits relacionados aos estimates (mesmo customer_id OU customer_name)
vendor_credits_for_estimates AS (
  SELECT DISTINCT
    e.id AS estimate_id,
    vc.id AS vendor_credit_id,
    vc.external_id,
    -vc.total_amount AS total_amount, -- Negativo porque são créditos (reduzem despesas)
    vc.txn_date,
    'vendor_credit' AS expense_type
  FROM filtered_estimates e
  INNER JOIN hvac_vendor_credit_lines vcl ON (
    (vcl.customer_id IS NOT NULL AND vcl.customer_id = e.customer_id) OR
    (vcl.customer_name IS NOT NULL AND vcl.customer_name = e.customer_name)
  )
  INNER JOIN hvac_vendor_credits vc ON vc.id = vcl.vendor_credit_id
  WHERE (p_date_from IS NULL OR vc.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR vc.txn_date <= p_date_to)
),

-- 6. Unificar todas as expenses (Bills + Purchases + Vendor Credits)
all_expenses_for_estimates AS (
  SELECT estimate_id, bill_id AS expense_id, external_id, total_amount, txn_date, expense_type FROM bills_for_estimates
  UNION ALL
  SELECT estimate_id, purchase_id AS expense_id, external_id, total_amount, txn_date, expense_type FROM purchases_for_estimates
  UNION ALL
  SELECT estimate_id, vendor_credit_id AS expense_id, external_id, total_amount, txn_date, expense_type FROM vendor_credits_for_estimates
),

-- 7. Buscar invoices relacionadas aos estimates (mesmo customer_id)
invoices_for_estimates AS (
  SELECT DISTINCT
    e.id AS estimate_id,
    i.id AS invoice_id,
    i.doc_number,
    i.external_id,
    i.total_amount,
    i.txn_date
  FROM filtered_estimates e
  INNER JOIN hvac_invoices i ON i.customer_id = e.customer_id
  WHERE (p_date_from IS NULL OR i.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR i.txn_date <= p_date_to)
),

-- 8. Buscar bill_payments relacionados às bills (via bill_payment_links)
bill_payments_for_estimates AS (
  SELECT DISTINCT
    bfe.estimate_id,
    bp.id AS bill_payment_id,
    bp.doc_number,
    bp.total_amount,
    bp.txn_date,
    bp.private_note
  FROM bills_for_estimates bfe
  INNER JOIN hvac_bill_payment_links bpl ON bpl.txn_id = bfe.external_id
  INNER JOIN hvac_bill_payments bp ON bp.id = bpl.bill_payment_id
  WHERE (p_date_from IS NULL OR bp.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR bp.txn_date <= p_date_to)
),

-- 9. Buscar payments relacionados às invoices (via payment_links)
payments_for_estimates AS (
  SELECT DISTINCT
    ife.estimate_id,
    p.id AS payment_id,
    p.total_amount,
    p.txn_date,
    p.payment_ref,
    p.private_note
  FROM invoices_for_estimates ife
  INNER JOIN hvac_payment_links pl ON pl.txn_id = ife.external_id AND pl.txn_type = 'Invoice'
  INNER JOIN hvac_payments p ON p.id = pl.payment_id
  WHERE (p_date_from IS NULL OR p.txn_date >= p_date_from)
    AND (p_date_to IS NULL OR p.txn_date <= p_date_to)
),

-- 10. Agregar dados de expenses por estimate (Bills + Purchases + Vendor Credits)
expenses_summary AS (
  SELECT
    estimate_id,
    COUNT(DISTINCT expense_id) AS expense_count,
    COALESCE(SUM(total_amount), 0) AS expense_total
  FROM all_expenses_for_estimates
  GROUP BY estimate_id
),

-- 11. Agregar dados de invoices por estimate
invoices_summary AS (
  SELECT
    estimate_id,
    COUNT(DISTINCT invoice_id) AS invoice_count,
    COALESCE(SUM(total_amount), 0) AS invoice_total
  FROM invoices_for_estimates
  GROUP BY estimate_id
),

-- 12. Agregar dados de bill_payments por estimate
bill_payments_summary AS (
  SELECT
    estimate_id,
    COUNT(DISTINCT bill_payment_id) AS payments_made_count,
    COALESCE(SUM(total_amount), 0) AS payments_made_total
  FROM bill_payments_for_estimates
  GROUP BY estimate_id
),

-- 13. Agregar dados de payments por estimate
payments_summary AS (
  SELECT
    estimate_id,
    COUNT(DISTINCT payment_id) AS payments_received_count,
    COALESCE(SUM(total_amount), 0) AS payments_received_total
  FROM payments_for_estimates
  GROUP BY estimate_id
)

-- 14. Resultado final combinando todos os dados
SELECT
  e.id AS estimate_id,
  e.customer_name AS project_name,
  e.customer_id,
  e.txn_status AS status,
  e.txn_date AS estimate_date,
  e.total_amount AS estimate_total,
  COALESCE(exp.expense_count, 0) AS expense_count,
  COALESCE(exp.expense_total, 0) AS expense_total,
  COALESCE(inv.invoice_count, 0) AS invoice_count,
  COALESCE(inv.invoice_total, 0) AS invoice_total,
  COALESCE(bps.payments_made_count, 0) AS payments_made_count,
  COALESCE(bps.payments_made_total, 0) AS payments_made_total,
  COALESCE(ps.payments_received_count, 0) AS payments_received_count,
  COALESCE(ps.payments_received_total, 0) AS payments_received_total
FROM filtered_estimates e
LEFT JOIN expenses_summary exp ON exp.estimate_id = e.id
LEFT JOIN invoices_summary inv ON inv.estimate_id = e.id
LEFT JOIN bill_payments_summary bps ON bps.estimate_id = e.id
LEFT JOIN payments_summary ps ON ps.estimate_id = e.id
ORDER BY e.txn_date DESC NULLS LAST;
$$;

-- Exemplo de uso:
-- SELECT * FROM get_project_carousel_data('2024-01-01', '2024-12-31', TRUE);
-- SELECT * FROM get_project_carousel_data(NULL, NULL, FALSE); 