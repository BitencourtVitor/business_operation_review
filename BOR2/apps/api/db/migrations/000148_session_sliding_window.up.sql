-- A sessão passa a se renovar sozinha, e cada uma sabe por quanto tempo vale.
--
-- Até aqui toda sessão durava sete dias fixos, contados do login e nunca
-- renovados. Quem usa o sistema todo dia era desconectado no oitavo dia sem ter
-- feito nada de errado, e quem só usa o Atlas sentia isso mais que todo mundo:
-- é gente abrindo uma prancha no celular, na obra, com uma mão suja, e a tela
-- que aparece é a de login.
--
-- `ttl_seconds` guarda a janela daquela sessão, decidida no login. Precisa ser
-- por sessão e não uma constante do código porque a janela depende de quem
-- entrou: conta que só enxerga o Atlas ganha uma janela longa, conta que
-- também abre o BOR continua na janela curta. Sem a coluna, renovar exigiria
-- reconsultar a permissão do usuário a cada requisição só para redescobrir um
-- número que não muda.
--
-- O padrão é a janela que já valia, então toda sessão viva hoje continua
-- exatamente como está.
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS ttl_seconds INTEGER NOT NULL DEFAULT 604800;
