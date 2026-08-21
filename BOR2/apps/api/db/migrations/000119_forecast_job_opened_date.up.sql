-- Quando o job foi aberto na conta do cliente.
--
-- O Job Schedule do portal traz uma única data por obra, e ela não é cronograma:
-- nas 69 obras de HVAC que aparecem nas duas fontes, a primeira Order vem de 87
-- a 451 dias depois dela — mediana de 237. É o marco de abertura do job na conta
-- (na prática, quando a casa entrou no sistema do builder), não a data em que a
-- HVAC entra na obra.
--
-- Guardada em coluna própria de propósito. Enfiá-la em previous_start_date faria
-- 177 obras nascerem com um início falso, e um número errado é pior que um campo
-- vazio: ninguém desconfia dele.
ALTER TABLE forecast_core
    ADD COLUMN IF NOT EXISTS job_opened_date DATE;
