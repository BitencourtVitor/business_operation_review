-- A obra do Atlas ganha o vocabulário que a empresa já usa, e a foto ganha
-- pasta e hora.
--
-- 1. Tipo de obra. No Forecast uma obra é `type` = Lot, Building ou House, e é
--    assim que ela é nomeada no dia a dia: comunidade + tipo + número —
--    "Willis Brook at Lynnfield, MA · Lot 46". Guardar comunidade e número
--    separados é o que permite ordenar, agrupar e reimportar sem depender de
--    quebrar uma string de nome.
--
-- 2. `forecast_id` liga a obra do Atlas à linha do Forecast de onde ela veio.
--    É o que impede a mesma obra de entrar duas vezes numa segunda importação,
--    e é nulo para obra criada à mão — que continua sendo um caminho válido.
--
-- 3. Foto e vídeo passam a ter pasta (`album`) e hora da captura (`taken_at`).
--    A hora vem do arquivo, não do upload: quem fotografa em obra manda tudo à
--    noite, e um álbum ordenado pelo upload conta a história errada.
ALTER TABLE atlas_jobsite
    ADD COLUMN IF NOT EXISTS kind        TEXT NOT NULL DEFAULT 'lot'
        CHECK (kind IN ('lot','building','house','other')),
    ADD COLUMN IF NOT EXISTS community   TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS unit        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS company     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS forecast_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS atlas_jobsite_forecast_unico
    ON atlas_jobsite (forecast_id) WHERE forecast_id IS NOT NULL;

ALTER TABLE atlas_media
    ADD COLUMN IF NOT EXISTS album    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS atlas_media_album_idx
    ON atlas_media (jobsite_id, album, taken_at DESC);
