-- Obra única por endereço.
--
-- Até aqui a obra existia só dentro de uma empresa: uma linha em forecast_core
-- com company='framing'. Mas a obra é física — a mesma casa recebe framing e
-- depois HVAC, e o forecast precisa saber que são a mesma coisa. Sem isso, o
-- selo "HVAC work included" era um checkbox que alguém marcava à mão em
-- forecast_core.hvac, e que envelhecia sozinho.
--
-- forecast_sites é a obra; forecast_site_companies diz quais empresas atuam
-- nela; forecast_core.site_id liga a linha de cada empresa à obra. O vínculo é
-- opcional: obra que só uma empresa atende tem uma companhia só, e obra sem
-- endereço fica com site_id NULL.

-- Endereço canônico: mesma normalização do converters/common.py no repo
-- Data Att Forecast, para que a chave calculada aqui e a calculada lá sejam a
-- mesma string. Caixa alta, sem pontuação, sem CEP, abreviação de logradouro
-- expandida ("12 Maple St., Plymouth, MA 02360" → "12 MAPLE STREET PLYMOUTH MA").
CREATE OR REPLACE FUNCTION forecast_address_key(addr TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        string_agg(
            CASE token
                WHEN 'ST'   THEN 'STREET'   WHEN 'STR'  THEN 'STREET'
                WHEN 'RD'   THEN 'ROAD'     WHEN 'DR'   THEN 'DRIVE'
                WHEN 'LN'   THEN 'LANE'     WHEN 'AVE'  THEN 'AVENUE'
                WHEN 'AV'   THEN 'AVENUE'   WHEN 'CT'   THEN 'COURT'
                WHEN 'PL'   THEN 'PLACE'    WHEN 'CIR'  THEN 'CIRCLE'
                WHEN 'BLVD' THEN 'BOULEVARD' WHEN 'HWY' THEN 'HIGHWAY'
                WHEN 'TER'  THEN 'TERRACE'  WHEN 'TRL'  THEN 'TRAIL'
                WHEN 'PKWY' THEN 'PARKWAY'  WHEN 'SQ'   THEN 'SQUARE'
                WHEN 'N'    THEN 'NORTH'    WHEN 'S'    THEN 'SOUTH'
                WHEN 'E'    THEN 'EAST'     WHEN 'W'    THEN 'WEST'
                WHEN 'APT'  THEN 'UNIT'     WHEN 'STE'  THEN 'UNIT'
                ELSE token
            END,
            ' ' ORDER BY ord
        ),
        ''
    )
    FROM regexp_split_to_table(
             regexp_replace(
                 regexp_replace(UPPER(COALESCE(addr, '')), '\m\d{5}(-\d{4})?\M', ' ', 'g'),
                 '[^A-Z0-9]+', ' ', 'g'
             ),
             '\s+'
         ) WITH ORDINALITY AS t(token, ord)
    WHERE token <> ''
$$;

-- Lote canônico: só os dígitos, sem zero à esquerda ('LOT 06' → '6'). Texto que
-- não tem número nenhum fica como veio, em caixa alta.
CREATE OR REPLACE FUNCTION forecast_lot_key(lot TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(TRIM(lot), '') = '' THEN ''
        WHEN (regexp_match(lot, '(\d+)'))[1] IS NOT NULL
            THEN COALESCE(NULLIF(LTRIM((regexp_match(lot, '(\d+)'))[1], '0'), ''), '0')
        ELSE UPPER(TRIM(lot))
    END
$$;

-- A obra é endereço + lote, não endereço. Dentro do forecast_core há endereço
-- que serve cinco lotes ("30 East Point Drive" no Riverview) e comunidade cujo
-- endereço é o próprio nome do job site (Glenford, Quincy) — sem o lote, essas
-- obras colapsariam numa só e o vínculo entre empresas sairia errado.
CREATE TABLE IF NOT EXISTS forecast_sites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    address_key TEXT        NOT NULL,
    lote_key    TEXT        NOT NULL DEFAULT '',
    address     TEXT        NOT NULL DEFAULT '',
    cliente     TEXT        NOT NULL DEFAULT '',
    job_site    TEXT        NOT NULL DEFAULT '',
    lote_bld    TEXT        NOT NULL DEFAULT '',
    type        TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (address_key, lote_key)
);

-- Agrupar as obras de um mesmo prédio/endereço continua sendo consulta comum.
CREATE INDEX IF NOT EXISTS idx_forecast_sites_address ON forecast_sites (address_key);

-- Escopo por empresa. Existe separado de forecast_core porque saber que a obra
-- tem HVAC não depende de já existir uma linha de forecast da HVAC: o portal do
-- cliente informa o escopo muito antes de a obra virar registro de forecast.
-- source diz de onde veio: 'forecast' (deduzido de uma linha de forecast_core)
-- ou 'portal' (export de Orders/Schedule do cliente).
CREATE TABLE IF NOT EXISTS forecast_site_companies (
    site_id    UUID        NOT NULL REFERENCES forecast_sites(id) ON DELETE CASCADE,
    company    TEXT        NOT NULL,
    source     TEXT        NOT NULL DEFAULT 'forecast',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (site_id, company)
);

ALTER TABLE forecast_core
    ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES forecast_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forecast_core_site ON forecast_core (site_id);
CREATE INDEX IF NOT EXISTS idx_forecast_site_companies_company
    ON forecast_site_companies (company);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Uma obra por endereço canônico. Quando duas linhas de forecast_core caem no
-- mesmo endereço, a mais antiga define os dados descritivos da obra.
INSERT INTO forecast_sites (address_key, lote_key, address, cliente, job_site, lote_bld, type)
SELECT DISTINCT ON (forecast_address_key(address), forecast_lot_key(lote_bld))
       forecast_address_key(address), forecast_lot_key(lote_bld),
       address, cliente, job_site, lote_bld, type
FROM forecast_core
WHERE forecast_address_key(address) <> ''
ORDER BY forecast_address_key(address), forecast_lot_key(lote_bld), create_datetime NULLS LAST
ON CONFLICT (address_key, lote_key) DO NOTHING;

UPDATE forecast_core c
SET site_id = s.id
FROM forecast_sites s
WHERE s.address_key = forecast_address_key(c.address)
  AND s.lote_key    = forecast_lot_key(c.lote_bld)
  AND c.site_id IS NULL;

INSERT INTO forecast_site_companies (site_id, company, source)
SELECT DISTINCT c.site_id, c.company, 'forecast'
FROM forecast_core c
WHERE c.site_id IS NOT NULL
ON CONFLICT (site_id, company) DO NOTHING;
