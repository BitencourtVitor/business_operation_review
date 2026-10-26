-- Valor do contrato: com ele a página sabe quanto falta faturar e receber,
-- somando as invoices vinculadas.
ALTER TABLE hvac_maintenance_contracts ADD COLUMN IF NOT EXISTS contract_value numeric;
