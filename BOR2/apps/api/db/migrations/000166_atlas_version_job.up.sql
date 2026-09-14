-- O processamento do set no servidor (ATL-102).
--
-- Até aqui quem cortava o PDF em folhas, desenhava a prévia, lia o nome e
-- calculava a impressão de cada página era o navegador de quem subia o arquivo,
-- e o banco só ficava sabendo do resultado no fim. Aba fechada no meio deixava
-- folha sem recorte e recorte sem folha. Agora o navegador sobe o PDF e avisa;
-- daí em diante o trabalho é da API, página a página, gravando cada folha assim
-- que ela fica pronta.
--
-- Esta tabela é o andamento desse trabalho: uma linha por versão, que a tela
-- consulta enquanto os cartões vão aparecendo. Ela também é a fila: na subida
-- da API, o que estiver `queued` ou `running` volta a rodar, e a rotina é
-- idempotente por página, então retomar não duplica nada.
CREATE TABLE IF NOT EXISTS atlas_version_job (
    version_id   TEXT PRIMARY KEY REFERENCES atlas_document_version(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','done','failed')),
    -- Em que passo está: download, pages, links.
    step         TEXT NOT NULL DEFAULT '',
    total        INTEGER NOT NULL DEFAULT 0,
    done         INTEGER NOT NULL DEFAULT 0,
    failed       INTEGER NOT NULL DEFAULT 0,
    links        INTEGER NOT NULL DEFAULT 0,
    error        TEXT NOT NULL DEFAULT '',
    -- O que o cliente decidiu antes de subir: nomes já lidos pelo gabarito
    -- (opcional), e, na revisão parcial, quais páginas o arquivo substitui.
    params       JSONB NOT NULL DEFAULT '{}'::jsonb,
    requested_by TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ
);

-- A página que falhou no processamento fica dita na própria folha, para o
-- cartão mostrar o porquê e oferecer tentar de novo, em vez de um espaço em
-- branco que ninguém sabe se ainda vai chegar.
ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS ingest_error TEXT NOT NULL DEFAULT '';
