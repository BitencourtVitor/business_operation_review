-- Função SQL simplificada para buscar dados de detalhes de um projeto
-- Consolida todas as consultas individuais em uma única chamada otimizada
-- Funciona para HVAC, Framing e PCG

-- FUNÇÃO DE TESTE/DEPURAÇÃO
CREATE OR REPLACE FUNCTION test_function()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'FUNÇÃO TESTE EXECUTADA COM SUCESSO!';
END;
$$;

-- FUNÇÃO PRINCIPAL
CREATE OR REPLACE FUNCTION get_project_details_data(
  p_estimate_id TEXT,
  p_company TEXT DEFAULT 'HVAC'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Buscar dados baseado na empresa
  IF p_company = 'HVAC' THEN
    SELECT jsonb_build_object(
      'estimate_data', COALESCE((SELECT to_jsonb(e.*) FROM hvac_estimates e WHERE e.id = p_estimate_id), '{}'::jsonb),
      'estimate_lines', COALESCE((SELECT jsonb_agg(to_jsonb(el.*)) FROM hvac_estimate_lines el WHERE el.estimate_id = p_estimate_id), '[]'::jsonb),
      'bill_lines', COALESCE((SELECT jsonb_agg(to_jsonb(bl.*)) FROM hvac_bill_lines bl INNER JOIN hvac_estimates e ON bl.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'bills', COALESCE((SELECT jsonb_agg(to_jsonb(b.*)) FROM hvac_bills b INNER JOIN (SELECT DISTINCT bl.bill_id FROM hvac_bill_lines bl INNER JOIN hvac_estimates e ON bl.customer_id = e.customer_id WHERE e.id = p_estimate_id) bill_ids ON b.id = bill_ids.bill_id), '[]'::jsonb),
      'purchase_lines', COALESCE((SELECT jsonb_agg(to_jsonb(pl.*)) FROM hvac_purchase_lines pl INNER JOIN hvac_estimates e ON pl.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'purchases', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM hvac_purchases p INNER JOIN (SELECT DISTINCT pl.purchase_id FROM hvac_purchase_lines pl INNER JOIN hvac_estimates e ON pl.customer_id = e.customer_id WHERE e.id = p_estimate_id) purchase_ids ON p.id = purchase_ids.purchase_id), '[]'::jsonb),
      'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(i.*)) FROM hvac_invoices i INNER JOIN hvac_estimates e ON i.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'deposits', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM hvac_deposits d INNER JOIN hvac_estimates e ON d.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb)
    ) INTO result;
  
  ELSIF p_company = 'Framing' THEN
    SELECT jsonb_build_object(
      'estimate_data', COALESCE((SELECT to_jsonb(e.*) FROM framing_estimates e WHERE e.id = p_estimate_id), '{}'::jsonb),
      'estimate_lines', COALESCE((SELECT jsonb_agg(to_jsonb(el.*)) FROM framing_estimate_lines el WHERE el.estimate_id = p_estimate_id), '[]'::jsonb),
      'bill_lines', COALESCE((SELECT jsonb_agg(to_jsonb(bl.*)) FROM framing_bill_lines bl INNER JOIN framing_estimates e ON bl.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'bills', COALESCE((SELECT jsonb_agg(to_jsonb(b.*)) FROM framing_bills b INNER JOIN (SELECT DISTINCT bl.bill_id FROM framing_bill_lines bl INNER JOIN framing_estimates e ON bl.customer_id = e.customer_id WHERE e.id = p_estimate_id) bill_ids ON b.id = bill_ids.bill_id), '[]'::jsonb),
      'purchase_lines', COALESCE((SELECT jsonb_agg(to_jsonb(pl.*)) FROM framing_purchase_lines pl INNER JOIN framing_estimates e ON pl.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'purchases', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM framing_purchases p INNER JOIN (SELECT DISTINCT pl.purchase_id FROM framing_purchase_lines pl INNER JOIN framing_estimates e ON pl.customer_id = e.customer_id WHERE e.id = p_estimate_id) purchase_ids ON p.id = purchase_ids.purchase_id), '[]'::jsonb),
      'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(i.*)) FROM framing_invoices i INNER JOIN framing_estimates e ON i.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'deposits', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM framing_deposits d INNER JOIN framing_estimates e ON d.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb)
    ) INTO result;
  
  ELSE -- PCG
    SELECT jsonb_build_object(
      'estimate_data', COALESCE((SELECT to_jsonb(e.*) FROM pcg_estimates e WHERE e.id = p_estimate_id), '{}'::jsonb),
      'estimate_lines', COALESCE((SELECT jsonb_agg(to_jsonb(el.*)) FROM pcg_estimate_lines el WHERE el.estimate_id = p_estimate_id), '[]'::jsonb),
      'bill_lines', COALESCE((SELECT jsonb_agg(to_jsonb(bl.*)) FROM pcg_bill_lines bl INNER JOIN pcg_estimates e ON bl.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'bills', COALESCE((SELECT jsonb_agg(to_jsonb(b.*)) FROM pcg_bills b INNER JOIN (SELECT DISTINCT bl.bill_id FROM pcg_bill_lines bl INNER JOIN pcg_estimates e ON bl.customer_id = e.customer_id WHERE e.id = p_estimate_id) bill_ids ON b.id = bill_ids.bill_id), '[]'::jsonb),
      'purchase_lines', COALESCE((SELECT jsonb_agg(to_jsonb(pl.*)) FROM pcg_purchase_lines pl INNER JOIN pcg_estimates e ON pl.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'purchases', COALESCE((SELECT jsonb_agg(to_jsonb(p.*)) FROM pcg_purchases p INNER JOIN (SELECT DISTINCT pl.purchase_id FROM pcg_purchase_lines pl INNER JOIN pcg_estimates e ON pl.customer_id = e.customer_id WHERE e.id = p_estimate_id) purchase_ids ON p.id = purchase_ids.purchase_id), '[]'::jsonb),
      'invoices', COALESCE((SELECT jsonb_agg(to_jsonb(i.*)) FROM pcg_invoices i INNER JOIN pcg_estimates e ON i.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb),
      'deposits', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM pcg_deposits d INNER JOIN pcg_estimates e ON d.customer_id = e.customer_id WHERE e.id = p_estimate_id), '[]'::jsonb)
    ) INTO result;
  END IF;

  RETURN result;
END;
$$;
