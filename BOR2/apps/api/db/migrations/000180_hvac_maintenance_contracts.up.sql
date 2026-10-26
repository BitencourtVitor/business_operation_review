-- Contratos de manutenção da HVAC (antes na planilha "Maintenance Clients").
-- O contrato não tem número; o que liga um cliente ao QuickBooks é o número da
-- invoice, e o pagamento é lido de qb_invoices.balance, que o sync atualiza todo dia.
CREATE TABLE IF NOT EXISTS hvac_maintenance_contracts (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name    text        NOT NULL,
  address        text        NOT NULL DEFAULT '',
  city           text        NOT NULL DEFAULT '',
  phone          text        NOT NULL DEFAULT '',
  email          text        NOT NULL DEFAULT '',
  plan_sent_on   date,
  contract_start date,
  invoices       text[]      NOT NULL DEFAULT '{}',
  first_service  date,
  second_service date,
  notes          text        NOT NULL DEFAULT '',
  archived       boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
