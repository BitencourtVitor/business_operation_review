-- Volta para a chave global. Só funciona se não houver o mesmo id em dois
-- trades — que é exatamente o que a 000125 passou a permitir.
ALTER TABLE pcg_trade_events DROP CONSTRAINT IF EXISTS pcg_trade_events_pkey;
ALTER TABLE pcg_trade_events ADD CONSTRAINT pcg_trade_events_pkey PRIMARY KEY (id);
