-- O id do evento é sequencial por trade ("e1", "e2", "e3"…), gerado no front em
-- `nextEventId`. A 000109 declarou `id` como chave primária GLOBAL, e o insert
-- usa ON CONFLICT (id) DO UPDATE — então o segundo trade que registrasse um "e1"
-- não inseria nada: reescrevia a linha de outro trade, que continuava pendurada
-- onde estava (o DO UPDATE não toca project_trade_id) e respondia 200.
--
-- Entre 25/08 e 31/08 isso comeu 16 dos 20 eventos registrados. A chave passa a
-- ser (project_trade_id, id): o id é único dentro do trade, que é o que o front
-- sempre garantiu.
ALTER TABLE pcg_trade_events DROP CONSTRAINT IF EXISTS pcg_trade_events_pkey;
ALTER TABLE pcg_trade_events ADD CONSTRAINT pcg_trade_events_pkey PRIMARY KEY (project_trade_id, id);
