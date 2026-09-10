-- Que pasta cada pessoa mantém no aparelho.
--
-- A seleção poderia viver só no dispositivo, e é lá que ela é usada. Mas guardar
-- apenas no aparelho custa três coisas que importam:
--
--   1. Trocar de iPad, ou reinstalar, apaga a configuração. Quem tinha catorze
--      pastas escolhidas recomeça do zero, e recomeça no dia em que o aparelho
--      quebrou, ou seja, no pior dia possível.
--   2. O servidor não sabe quem mantém o quê. Sem isso não há como avisar que
--      uma sobrescrita atingiu pasta que alguém carrega no bolso, e essa é a
--      situação perigosa de verdade: gente trabalhando no canteiro com revisão
--      vencida sem saber que venceu.
--   3. Não há como medir. Quantas pastas por pessoa, quais obras concentram uso
--      offline, qual o peso disso — tudo cego.
--
-- Uma linha por pessoa e pasta. A obra vem junto e não é derivada da pasta de
-- propósito: o job de expiração e o painel varrem por obra, e alcançar a obra
-- por join com atlas_document a cada varredura é trabalho repetido para um
-- dado que nunca muda depois de escrito.
CREATE TABLE IF NOT EXISTS atlas_offline_folder (
    user_id      TEXT NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
    jobsite_id   TEXT NOT NULL REFERENCES atlas_jobsite(id)  ON DELETE CASCADE,
    document_id  TEXT NOT NULL REFERENCES atlas_document(id) ON DELETE CASCADE,

    -- A revisão que o aparelho tem gravada. É contra ela que a detecção de
    -- revisão nova compara, e a comparação é entre inteiros justamente para ser
    -- barata o suficiente para rodar em todo evento `online` e em todo retorno
    -- do app ao primeiro plano.
    --
    -- Nasce em zero: escolhida, ainda não baixada. Sem o zero, "sem revisão" e
    -- "revisão 1" ficariam ambíguos num campo nulo.
    local_revision INTEGER NOT NULL DEFAULT 0,

    selected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- O relógio da expiração, e a razão de ser coluna e não JSONB.
    --
    -- JSONB serve para configuração livre, que ninguém consulta por valor. Este
    -- campo é o oposto: o job de expiração ordena e filtra por ele em toda
    -- varredura. Dentro de um JSONB isso seria varredura sequencial da tabela
    -- inteira a cada rodada.
    --
    -- Quem carimba é o cliente, com a hora do último acesso local, e não o
    -- servidor no momento do sync. A pessoa passa semanas abrindo a obra offline
    -- sem sincronizar nenhuma vez: contar do sync marcaria como abandonada
    -- justamente a pasta mais usada.
    last_access_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, document_id)
);

-- O job de expiração varre por idade, e é a única varredura que cruza toda a
-- tabela. Sem este índice ela nasce como sequential scan e piora à medida que o
-- produto é adotado, que é exatamente quando não se pode piorar.
CREATE INDEX IF NOT EXISTS atlas_offline_folder_last_access_idx
    ON atlas_offline_folder (last_access_at);

-- E o caminho inverso: dada uma pasta que acabou de receber revisão nova, quem
-- precisa ser avisado. É a consulta do aviso de sobrescrita.
CREATE INDEX IF NOT EXISTS atlas_offline_folder_document_idx
    ON atlas_offline_folder (document_id);

-- A varredura por obra, para o painel e para o escopo por obra do job.
CREATE INDEX IF NOT EXISTS atlas_offline_folder_jobsite_idx
    ON atlas_offline_folder (jobsite_id);

COMMENT ON TABLE atlas_offline_folder IS
    'Pastas que cada usuário mantém baixadas no aparelho. A expiração remove os '
    'bytes no dispositivo e preserva esta linha: reativar é um toque, não '
    'reconfigurar.';
