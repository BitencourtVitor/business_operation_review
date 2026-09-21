-- Formulário de cotação respondido fora do BOR.
--
-- O link vai por WhatsApp e quem abre não faz login, então o formulário carrega
-- a cópia congelada das perguntas: o catálogo de trades ainda vive no
-- localStorage de quem administra, e um visitante anônimo não tem como lê-lo.
--
-- As respostas chegam como entidade própria, nunca por cima do trade. Aplicar o
-- que veio é decisão de quem tem acesso ao BOR, tomada depois de ler.
CREATE TABLE IF NOT EXISTS pcg_bid_forms (
    id            TEXT PRIMARY KEY,
    project_id    TEXT        NOT NULL REFERENCES pcg_projects(id) ON DELETE CASCADE,
    trade_id      TEXT        NOT NULL,
    -- O que o link mostra: obra, endereço, trade e as perguntas como estavam no
    -- dia em que o link foi criado. Editar o catálogo depois não muda o papel
    -- que alguém já recebeu.
    snapshot      JSONB       NOT NULL,
    answers       JSONB,
    -- Desligado pelo BOR a qualquer momento, e sozinho no envio: respondido uma
    -- vez, o link fecha. O mesmo trade da mesma obra pode ter vários.
    available     BOOLEAN     NOT NULL DEFAULT TRUE,
    submitted_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS pcg_bid_forms_project_idx ON pcg_bid_forms (project_id, trade_id);
