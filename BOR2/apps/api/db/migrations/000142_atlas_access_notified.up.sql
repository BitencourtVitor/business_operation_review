-- Quando o subcontratado foi avisado de que a obra existe para ele.
--
-- Conceder acesso e avisar são gestos separados de propósito: quem concede
-- costuma fazer isso no meio de outra coisa, e o convite tem de sair quando o
-- responsável decidir, não quando o clique aconteceu. Sem esta coluna não há
-- como saber se o aviso já foi, e a dúvida termina em dois e-mails ou em
-- nenhum.
ALTER TABLE atlas_jobsite_access
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

COMMENT ON COLUMN atlas_jobsite_access.notified_at IS
  'Quando o convite por e-mail foi enviado para esta pessoa nesta obra. Nulo: nunca avisada.';
