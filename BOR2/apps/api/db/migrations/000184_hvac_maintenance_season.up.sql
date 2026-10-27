-- Estação do ano em que o contrato foi pedido. Escolhida à mão; as quatro
-- ficam por padronização, mesmo a operação usando só summer e winter.
ALTER TABLE hvac_maintenance_contracts
  ADD COLUMN season text CHECK (season IN ('spring', 'summer', 'fall', 'winter'));
