-- O texto de cada página, palavra a palavra, com a caixa de cada uma.
--
-- O ingest já roda `pdftotext -bbox-layout` para nomear a folha pelo gabarito, e
-- até aqui jogava fora o resultado. O navegador então abria o mesmo PDF com
-- pdf.js e refazia a mesma leitura para sugerir os hiperlinks, que é a espera
-- que o usuário sente ao clicar em "Scan for links".
--
-- Guardar aqui faz a varredura virar uma consulta, e o remapeamento de algumas
-- folhas custar quase nada.
--
-- A chave é a versão mais o índice da página, e não a folha: no ingest a palavra
-- é lida antes de a folha existir, e a versão é o que já existe nesse momento.
--
-- Tabela própria, e não coluna em `atlas_sheet`: a linha da folha é lida em
-- lista o tempo todo, e pendurar um JSONB grande nela encareceria leitura que
-- não precisa do texto.
CREATE TABLE IF NOT EXISTS atlas_page_text (
    version_id TEXT    NOT NULL REFERENCES atlas_document_version(id) ON DELETE CASCADE,
    page_index INT     NOT NULL,
    -- Tamanho da página em pontos, como o poppler leu. Fica junto porque a
    -- caixa da palavra só faz sentido contra ele.
    width      DOUBLE PRECISION NOT NULL,
    height     DOUBLE PRECISION NOT NULL,
    -- [{"t":"A-101","x0":0.1,"y0":0.2,"x1":0.2,"y1":0.22}, ...]
    -- Coordenada já normalizada de 0 a 1, que é como o autolink trabalha.
    words      JSONB   NOT NULL DEFAULT '[]'::jsonb,
    -- Página rasterizada, sem texto extraível. Declarar é melhor que guardar
    -- lista vazia: a conferência diz quantas ficaram de fora por precisarem de
    -- OCR, em vez de a pessoa achar que a automação não encontrou nada.
    no_text    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (version_id, page_index)
);
