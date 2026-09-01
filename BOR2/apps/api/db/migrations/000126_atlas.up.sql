-- Atlas — gestão documental e diário de obra, segundo braço da plataforma.
--
-- Esquema fixado no AT-4 do backlog de 01/09, com as duas correções que a
-- proposta original recebeu:
--
--   1. A FK mora no filho. O documento não guarda a lista de fragmentos; cada
--      fragmento sabe de qual versão veio. Com a FK no pai, um documento só
--      apontaria para um fragmento.
--   2. Anotação é uma linha por traço, nunca uma coluna JSONB coletiva na
--      folha. Uma folha com 400 traços viraria um JSONB de vários MB e cada
--      traço novo reescreveria os 400 anteriores — além de perder autoria por
--      anotação e de causar lost update entre dois usuários na mesma folha.
--
-- O arquivo nunca vive aqui: o R2 guarda o PDF original, uma cópia, e o banco
-- guarda metadado, versão, referência e permissão. `r2_key` é o endereço.
--
-- Auditoria: nada de tabela própria. A 000124 instala `zz_audit` em toda tabela
-- nova por event trigger, e o middleware Audit já registra a requisição. O que
-- o AT-7 pede — autor, data e versão exata — sai dessas duas fontes somadas ao
-- vínculo obrigatório com `atlas_document_version` que o esquema abaixo impõe.

-- ── Obra ────────────────────────────────────────────────────────────────────
-- Entidade própria do Atlas, não a do Forecast. `catalog_job_site_id` liga as
-- duas quando a obra também existe lá, mas o Atlas não depende disso para
-- funcionar: obra de subcontratado pode nunca entrar no catálogo do Forecast.
CREATE TABLE IF NOT EXISTS atlas_jobsite (
    id                  TEXT PRIMARY KEY,
    name                TEXT        NOT NULL,
    address             TEXT        NOT NULL DEFAULT '',
    client              TEXT        NOT NULL DEFAULT '',
    code                TEXT        NOT NULL DEFAULT '',
    status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','archived')),
    catalog_job_site_id BIGINT      REFERENCES catalog_job_sites(id) ON DELETE SET NULL,
    created_by          TEXT        NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Acesso por obra (AT-6, eixo 2) ──────────────────────────────────────────
-- Permissão do Atlas não é global. `level` é o teto do que a pessoa faz dentro
-- da obra; o acesso ao produto em si continua no `user_permissions` da
-- plataforma, sob a chave `atlas`.
CREATE TABLE IF NOT EXISTS atlas_jobsite_access (
    jobsite_id  TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level       TEXT        NOT NULL DEFAULT 'read'
                CHECK (level IN ('read','annotate','manage')),
    granted_by  TEXT        NOT NULL DEFAULT '',
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Convite de externo expira; acesso interno não precisa preencher.
    expires_at  TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    PRIMARY KEY (jobsite_id, user_id)
);

-- ── Documento ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_document (
    id          TEXT PRIMARY KEY,
    jobsite_id  TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    discipline  TEXT        NOT NULL DEFAULT '',
    kind        TEXT        NOT NULL DEFAULT 'drawing'
                CHECK (kind IN ('drawing','spec','permit','submittal','other')),
    created_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

-- ── Versão ──────────────────────────────────────────────────────────────────
-- O original é imutável: revisão nova é linha nova, nunca sobrescrita. É esta
-- tabela no meio que impede uma anotação feita na rev 2 de aparecer flutuando
-- sobre a rev 3 como se tivesse sido feita nela.
--
-- `status` acompanha o upload direto para o R2 (AT-9): a linha nasce `pending`
-- junto com a URL assinada, vira `uploaded` quando o cliente confirma e o
-- backend confere o tamanho, e só vira `published` depois da revisão do
-- metadado das folhas.
CREATE TABLE IF NOT EXISTS atlas_document_version (
    id           TEXT PRIMARY KEY,
    document_id  TEXT        NOT NULL REFERENCES atlas_document(id) ON DELETE CASCADE,
    revision     TEXT        NOT NULL,
    r2_key       TEXT        NOT NULL,
    byte_size    BIGINT      NOT NULL DEFAULT 0,
    page_count   INTEGER     NOT NULL DEFAULT 0,
    checksum     TEXT        NOT NULL DEFAULT '',
    content_type TEXT        NOT NULL DEFAULT 'application/pdf',
    status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','uploaded','published','failed')),
    notes        TEXT        NOT NULL DEFAULT '',
    uploaded_by  TEXT        NOT NULL DEFAULT '',
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    CONSTRAINT atlas_document_version_unica UNIQUE (document_id, revision)
);

-- ── Folha ───────────────────────────────────────────────────────────────────
-- O fragmento: linha, não arquivo. Cortar o PDF em páginas infla ~5,5x (AT-4),
-- então a folha é um índice de página com o metadado lido do carimbo, e a
-- leitura se resolve renderizando sob demanda a partir do original.
--
-- O mecanismo de fragmentação em si — o que conta como folha no padrão do
-- Fieldwire — ainda não foi decidido (AT-10). Esta tabela é o destino de
-- qualquer resposta: muda a heurística que preenche as colunas, não o formato.
CREATE TABLE IF NOT EXISTS atlas_sheet (
    id           TEXT PRIMARY KEY,
    version_id   TEXT        NOT NULL REFERENCES atlas_document_version(id) ON DELETE CASCADE,
    page_index   INTEGER     NOT NULL,
    sheet_number TEXT        NOT NULL DEFAULT '',
    discipline   TEXT        NOT NULL DEFAULT '',
    level        TEXT        NOT NULL DEFAULT '',
    title        TEXT        NOT NULL DEFAULT '',
    revision     TEXT        NOT NULL DEFAULT '',
    thumb_key    TEXT        NOT NULL DEFAULT '',
    width_pt     NUMERIC(10,2),
    height_pt    NUMERIC(10,2),
    -- Confiança da inferência do carimbo (AT-12). O que ficar duvidoso vai para
    -- revisão manual antes de o documento ser publicado a externos.
    confidence   NUMERIC(4,3) NOT NULL DEFAULT 0,
    needs_review BOOLEAN     NOT NULL DEFAULT true,
    CONSTRAINT atlas_sheet_unica UNIQUE (version_id, page_index)
);

-- ── Anotação ────────────────────────────────────────────────────────────────
-- Uma linha por traço. `geometry` guarda os pontos normalizados em relação à
-- página (0..1), para o traço acompanhar qualquer nível de zoom sem depender da
-- resolução do render.
--
-- `id` é gerado no cliente: campo tem sinal ruim, e anotar offline para
-- sincronizar depois exige que o traço já nasça com identidade.
CREATE TABLE IF NOT EXISTS atlas_annotation (
    id         TEXT PRIMARY KEY,
    sheet_id   TEXT        NOT NULL REFERENCES atlas_sheet(id) ON DELETE CASCADE,
    author_id  TEXT        NOT NULL DEFAULT '',
    tool       TEXT        NOT NULL DEFAULT 'pen'
               CHECK (tool IN ('pen','highlighter')),
    color      TEXT        NOT NULL DEFAULT '#ef4444',
    width      NUMERIC(6,3) NOT NULL DEFAULT 2,
    opacity    NUMERIC(4,3) NOT NULL DEFAULT 1,
    geometry   JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Soft delete: apagar um traço não pode apagar o registro de que ele
    -- existiu, senão a trilha do AT-7 mente por omissão.
    deleted_at TIMESTAMPTZ
);

-- ── Evento ancorado na planta (AT-15) ───────────────────────────────────────
-- Pin num ponto ou região da folha. Coordenadas relativas à página: aponta o
-- lugar exato sem gerar arquivo novo.
CREATE TABLE IF NOT EXISTS atlas_event (
    id          TEXT PRIMARY KEY,
    jobsite_id  TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    sheet_id    TEXT        REFERENCES atlas_sheet(id) ON DELETE SET NULL,
    kind        TEXT        NOT NULL DEFAULT 'comment'
                CHECK (kind IN ('comment','issue','task','rfi')),
    title       TEXT        NOT NULL DEFAULT '',
    body        TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','answered','resolved')),
    page_x      NUMERIC(6,5),
    page_y      NUMERIC(6,5),
    region      JSONB,
    created_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS atlas_event_reply (
    id         TEXT PRIMARY KEY,
    event_id   TEXT        NOT NULL REFERENCES atlas_event(id) ON DELETE CASCADE,
    author_id  TEXT        NOT NULL DEFAULT '',
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Diário de obra (AT-16, Fase 2) ──────────────────────────────────────────
-- Cada registro carrega data, clima e o que foi executado. O conjunto forma o
-- calendário da obra (AT-17), que anda junto com os documentos dela.
CREATE TABLE IF NOT EXISTS atlas_daily_log (
    id          TEXT PRIMARY KEY,
    jobsite_id  TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    log_date    DATE        NOT NULL,
    weather     TEXT        NOT NULL DEFAULT '',
    temperature NUMERIC(5,1),
    crew_size   INTEGER,
    summary     TEXT        NOT NULL DEFAULT '',
    created_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Mídia ───────────────────────────────────────────────────────────────────
-- Foto, áudio, vídeo e anexo, sempre no R2 e sempre pendurados em alguma coisa:
-- um evento da planta ou um dia do diário. Mesmo ciclo de upload assinado das
-- versões de documento.
CREATE TABLE IF NOT EXISTS atlas_media (
    id           TEXT PRIMARY KEY,
    jobsite_id   TEXT        NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,
    event_id     TEXT        REFERENCES atlas_event(id) ON DELETE CASCADE,
    daily_log_id TEXT        REFERENCES atlas_daily_log(id) ON DELETE CASCADE,
    kind         TEXT        NOT NULL DEFAULT 'photo'
                 CHECK (kind IN ('photo','audio','video','file')),
    r2_key       TEXT        NOT NULL,
    file_name    TEXT        NOT NULL DEFAULT '',
    content_type TEXT        NOT NULL DEFAULT '',
    byte_size    BIGINT      NOT NULL DEFAULT 0,
    caption      TEXT        NOT NULL DEFAULT '',
    status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','uploaded','failed')),
    uploaded_by  TEXT        NOT NULL DEFAULT '',
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_document_jobsite_idx  ON atlas_document (jobsite_id);
CREATE INDEX IF NOT EXISTS atlas_version_document_idx  ON atlas_document_version (document_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS atlas_sheet_version_idx     ON atlas_sheet (version_id, page_index);
CREATE INDEX IF NOT EXISTS atlas_annotation_sheet_idx  ON atlas_annotation (sheet_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS atlas_event_jobsite_idx     ON atlas_event (jobsite_id, status);
CREATE INDEX IF NOT EXISTS atlas_event_sheet_idx       ON atlas_event (sheet_id);
CREATE INDEX IF NOT EXISTS atlas_event_reply_event_idx ON atlas_event_reply (event_id, created_at);
CREATE INDEX IF NOT EXISTS atlas_daily_log_jobsite_idx ON atlas_daily_log (jobsite_id, log_date DESC);
CREATE INDEX IF NOT EXISTS atlas_media_event_idx       ON atlas_media (event_id);
CREATE INDEX IF NOT EXISTS atlas_media_daily_log_idx   ON atlas_media (daily_log_id);
CREATE INDEX IF NOT EXISTS atlas_access_user_idx       ON atlas_jobsite_access (user_id) WHERE revoked_at IS NULL;
