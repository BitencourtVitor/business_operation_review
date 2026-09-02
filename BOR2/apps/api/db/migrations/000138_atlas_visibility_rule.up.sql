-- Quem vê qual projeto no Atlas.
--
-- O padrão é ver tudo: quem tem a chave `atlas` enxerga a lista inteira, e o que
-- se cadastra aqui é a exceção. O modelo anterior era o oposto, por concessão,
-- e o resultado é que as oito pessoas migradas do Fieldwire não viam projeto
-- nenhum: ninguém tinha recebido grant.
--
-- A regra é uma linha por (usuário, escopo, valor) para o filtro poder crescer
-- sem migração nova. Hoje a tela escreve só `deny` em `jobsite`; os escopos
-- `kind` e `client` já existem para o dia em que alguém precisar ver só prédio,
-- só casa, ou só as obras de um cliente.
--
-- `allow` é restritivo, não aditivo: se o usuário tem qualquer allow, ele passa
-- a ver apenas o que casa com eles. `deny` vence sempre, inclusive sobre allow.
CREATE TABLE IF NOT EXISTS atlas_visibility_rule (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    effect      TEXT NOT NULL DEFAULT 'deny' CHECK (effect IN ('deny', 'allow')),
    scope       TEXT NOT NULL CHECK (scope IN ('jobsite', 'kind', 'client')),
    value       TEXT NOT NULL,
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, effect, scope, value)
);

CREATE INDEX IF NOT EXISTS atlas_visibility_rule_user_idx
    ON atlas_visibility_rule (user_id);
CREATE INDEX IF NOT EXISTS atlas_visibility_rule_lookup_idx
    ON atlas_visibility_rule (scope, value);
