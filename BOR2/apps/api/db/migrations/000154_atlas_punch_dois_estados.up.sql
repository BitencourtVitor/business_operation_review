-- A condição do ponto passa a ter dois estados, e `answered` deixa de existir.
--
-- Eram três: `open` ao nascer, `answered` quando alguém respondia, `resolved`
-- quando o problema acabava. O do meio nascia sozinho, no momento em que um
-- comentário era gravado.
--
-- E é justamente aí que ele mentia. Comentar não é resolver. Anexar a foto do
-- depois não é resolver. Alguém escrever "vi, vou olhar amanhã" mudava a
-- condição do ponto sem que nada tivesse mudado na obra, e num punch list o que
-- interessa é uma pergunta só: isto ainda está pendente, ou já foi feito? Quem
-- responde essa pergunta é quem foi lá e fez, marcando, e não quem passou e
-- comentou.
--
-- Ficam dois. `open` é pendente, `resolved` é concluído. O que estava em
-- `answered` volta para pendente, que é o que ele sempre foi de fato: ninguém
-- havia dito que estava resolvido.

UPDATE atlas_event SET status = 'open' WHERE status = 'answered';

ALTER TABLE atlas_event DROP CONSTRAINT IF EXISTS atlas_event_status_check;
ALTER TABLE atlas_event
    ADD CONSTRAINT atlas_event_status_check
    CHECK (status IN ('open', 'resolved'));

-- O mesmo no log de eventos de campo, que carrega a condição no payload e
-- precisa recusar o valor extinto em vez de gravá-lo e quebrar a projeção
-- depois.
UPDATE atlas_sync_event
   SET payload = jsonb_set(payload, '{status}', '"open"')
 WHERE kind = 'point.status_changed' AND payload->>'status' = 'answered';

COMMENT ON COLUMN atlas_event.status IS
    'Condição do ponto no punch list: open (pendente) ou resolved (concluído). '
    'Comentar e anexar foto não mudam a condição; só quem executou marca.';
