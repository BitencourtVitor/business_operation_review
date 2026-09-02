-- De qual empresa o subcontratado é.
--
-- Fica em tabela do Atlas, e não numa coluna de `users`, porque é informação
-- que só o Atlas usa: o BOR não tem o conceito de gente de fora da Premium.
-- Também não cabe no `user_permissions`, que guarda nível de acesso e não
-- texto.
--
-- Sem isso, "John Carter" numa lista de acesso não diz de quem ele é — e é
-- justamente isso que se precisa saber ao revisar quem enxerga a planta.
CREATE TABLE IF NOT EXISTS atlas_user_company (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company    TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
