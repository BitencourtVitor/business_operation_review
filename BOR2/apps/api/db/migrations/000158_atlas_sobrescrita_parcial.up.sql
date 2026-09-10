-- Sobrescrever passa a ter escopo, e a folha passa a saber de que versão veio.
--
-- Hoje subir uma revisão é subir o set inteiro: cria-se uma versão nova e todas
-- as folhas dela nascem juntas. Isso é o certo quando o arquiteto reemite as 51
-- pranchas, e é desproporcional no caso comum, que é uma folha ter sido
-- corrigida. Reemitir 51 para trocar uma faz o campo rebaixar 107 MB por causa
-- de 2 MB, e apaga o histórico das 50 que não mudaram.
--
-- A saída não é permitir escrever por cima da folha antiga. Isso destruiria o
-- que a revisão existe para preservar: a prancha que estava valendo quando
-- alguém executou a partir dela. A saída é a versão continuar sendo criada, e
-- **herdar** as folhas que não foram tocadas.

-- De onde esta folha veio.
--
-- Nulo é folha nova, que nasceu no upload da própria versão. Preenchido é folha
-- herdada: o conteúdo é o da versão anterior, e a linha existe para a versão
-- nova estar completa sem duplicar o arquivo no bucket.
--
-- É o que faz a herança ser barata. As duas linhas apontam para a mesma chave de
-- R2, e o objeto é gravado uma vez só.
ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS inherited_from TEXT REFERENCES atlas_sheet(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS atlas_sheet_inherited_idx
    ON atlas_sheet (inherited_from) WHERE inherited_from IS NOT NULL;

-- O escopo com que a versão foi criada, guardado na própria versão.
--
-- Serve para a tela poder dizer "esta revisão trocou 3 folhas" em vez de mostrar
-- 51 e deixar quem lê procurar a diferença. E serve para o aviso de sobrescrita:
-- quem mantém a pasta offline precisa saber se vale a pena rebaixar tudo ou se
-- mudaram três páginas.
ALTER TABLE atlas_document_version
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'full'
        CHECK (scope IN ('full', 'range', 'single')),
    -- Quais páginas a revisão de fato trocou. Vazio quando o escopo é `full`,
    -- porque aí a resposta é "todas" e listar 51 números não acrescenta nada.
    ADD COLUMN IF NOT EXISTS scope_pages INTEGER[] NOT NULL DEFAULT '{}';

-- O acervo existente é tudo `full`: toda versão até aqui foi criada subindo o
-- arquivo inteiro, porque não havia outra forma.
UPDATE atlas_document_version SET scope = 'full' WHERE scope IS NULL;

COMMENT ON COLUMN atlas_sheet.inherited_from IS
    'A folha da versão anterior de que esta é cópia. Nulo = folha nova. As duas '
    'apontam para a mesma chave no R2: o objeto é gravado uma vez.';
COMMENT ON COLUMN atlas_document_version.scope IS
    'full = set inteiro reemitido; range/single = revisão parcial, e scope_pages '
    'diz quais páginas mudaram.';
