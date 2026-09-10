-- A condição da task passa a ser um conjunto fechado, e reabrir apaga o rastro
-- de quem fechou.
--
-- `status` é texto livre com default 'open'. Três valores circulam hoje: 'open'
-- quando nasce, 'answered' quando alguém responde, 'resolved' quando o problema
-- acaba. Nada impede um quarto valor de entrar por um caminho novo, e no dia em
-- que entrar a cor do pino e o filtro da lista param de bater sem ninguém
-- perceber, porque não há erro: há uma task com uma condição que a tela não
-- sabe pintar.
--
-- O CHECK fecha isso. Não é a decisão sobre estados intermediários, que segue em
-- aberto (PEN-3): é a garantia de que, seja qual for o conjunto decidido, ele
-- passe por aqui em vez de nascer numa string solta no meio de um handler.

-- Qualquer valor fora do trio vira 'open'. Não há nenhum hoje; a linha existe
-- para a migração não falhar num ambiente que tenha divergido.
UPDATE atlas_event SET status = 'open'
 WHERE status NOT IN ('open', 'answered', 'resolved');

ALTER TABLE atlas_event DROP CONSTRAINT IF EXISTS atlas_event_status_check;
ALTER TABLE atlas_event
    ADD CONSTRAINT atlas_event_status_check
    CHECK (status IN ('open', 'answered', 'resolved'));

-- E o par resolved_by/resolved_at passa a existir só enquanto a task estiver
-- resolvida.
--
-- Reabrir gravava a condição nova e deixava os dois campos como estavam, então
-- a task voltava para a lista de abertas ainda afirmando quem a tinha fechado e
-- quando. Quem lê a lista vê contradição; quem for montar relatório de punch
-- list a partir disso conta como resolvida uma task que está aberta.
UPDATE atlas_event
   SET resolved_by = NULL, resolved_at = NULL
 WHERE status <> 'resolved'
   AND (resolved_by IS NOT NULL OR resolved_at IS NOT NULL);

ALTER TABLE atlas_event DROP CONSTRAINT IF EXISTS atlas_event_resolved_coerente;
ALTER TABLE atlas_event
    ADD CONSTRAINT atlas_event_resolved_coerente
    CHECK (status = 'resolved' OR (resolved_by IS NULL AND resolved_at IS NULL));
