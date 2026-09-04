-- Versão por data e hora, e histórico por folha.
--
-- Até aqui a versão era um número digitado e valia para o set inteiro: trocar
-- uma folha obrigava a subir as 97 de novo, e a folha antiga sumia junto com a
-- versão que a continha. Quem recebe uma prancha corrigida do projetista não
-- recebe o set: recebe a prancha.
--
-- Depois desta migração a folha tem linhagem própria. A linha atual de cada
-- página é a que não foi sucedida; as anteriores continuam no banco, com quem
-- as trocou, quando, e com que nome e observação. As anotações não migram entre
-- revisões de propósito: elas foram feitas sobre um desenho, e aquele desenho
-- continua existindo na revisão em que foram feitas.

-- ── A versão do set ganha nome ──────────────────────────────────────────────
-- `notes` já existia. O número da revisão continua na tabela porque é chave
-- única do set, mas quem identifica a versão na tela passa a ser a data e a
-- hora, com o nome ao lado quando alguém deu um.
ALTER TABLE atlas_document_version
    ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

-- ── A folha ganha linhagem ──────────────────────────────────────────────────
ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS revised_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS revised_by    TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version_name  TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS version_notes TEXT        NOT NULL DEFAULT '';

-- Uma página pode ter várias linhas agora, mas só uma valendo. A unicidade
-- passa a ser da folha atual, e não da página.
ALTER TABLE atlas_sheet DROP CONSTRAINT IF EXISTS atlas_sheet_unica;

CREATE UNIQUE INDEX IF NOT EXISTS atlas_sheet_atual_uniq
    ON atlas_sheet (version_id, page_index)
    WHERE superseded_at IS NULL;

-- O histórico de uma página é lido inteiro de uma vez, do mais novo ao mais
-- velho.
CREATE INDEX IF NOT EXISTS atlas_sheet_historia_idx
    ON atlas_sheet (version_id, page_index, revised_at DESC);
