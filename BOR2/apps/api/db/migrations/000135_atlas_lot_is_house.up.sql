-- Lot e House são a mesma coisa.
--
-- O vocabulário do Forecast separa os dois — `lot` na Pulte e na Toll Brothers,
-- `house` na Private —, mas é a mesma obra: uma casa num terreno. Manter os
-- dois na taxonomia obrigava a cadastrar cada categoria duas vezes e criava a
-- chance de as duas listas divergirem com o tempo.
--
-- Fica `house`. A obra com `kind = 'lot'` passa a casar com ela pela
-- normalização feita no backend, e as linhas duplicadas saem daqui.
DELETE FROM atlas_doc_category WHERE build_type = 'lot';
