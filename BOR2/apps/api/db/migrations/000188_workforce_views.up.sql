-- Workforce Productivity a partir do dado bruto do QB Time (WF-19).
-- O tratamento que estava espalhado entre a importação (Go) e a página (TSX)
-- passa a morar aqui: regras em tabelas editáveis e views em cadeia.
--
--   qbtime_timesheets (cru, como a API devolve)
--     → v_wp_entries   caminho da obra → cliente, job site, lote, work type; empresa
--     → v_wp_split     regular e overtime por funcionário e semana
--     → v_wp_allocated horas só no job site divididas entre os lotes
--     → mv_wp_hours    materializada, a que a página lê

-- ── Regras ────────────────────────────────────────────────────────────────────

-- Apelidos de work type → nome canônico (o mapa de 29 chaves do importador).
CREATE TABLE IF NOT EXISTS wp_rule_worktype_alias (
  alias     text PRIMARY KEY, -- minúsculas
  canonical text NOT NULL
);
INSERT INTO wp_rule_worktype_alias (alias, canonical) VALUES
  ('normal labor', 'Normal Labor'), ('normal labour', 'Normal Labor'), ('panels', 'Panels'),
  ('office', 'Office'), ('back charge', 'Back Charge'), ('new installation', 'New Installation'),
  ('new instalation', 'New Installation'), ('lunch break', 'Lunch Break'),
  ('lunch break office', 'Lunch Break Office'), ('lunch break es', 'Lunch Break'),
  ('lunch break paid', 'Lunch Break'), ('lunck break paid', 'Lunch Break'), ('doors', 'Doors'),
  ('extra', 'Extra'), ('transport', 'Transport'), ('holiday', 'Holiday'), ('holiday paid', 'Holiday'),
  ('holiday unpaid', 'Holiday Unpaid'), ('unpaid holiday', 'Holiday Unpaid'), ('vacation', 'Vacation'),
  ('vacation not paid', 'Vacation Unpaid'), ('sick', 'Sick'), ('maintenance', 'Maintenance'),
  ('shift total', 'Shift Total'), ('warranty', 'Warranty'), ('service', 'Service'), ('admin', 'Admin'),
  ('unregistered location', 'Unregistered Location'), ('service call', 'Service Call')
ON CONFLICT (alias) DO NOTHING;

-- Pastas de agrupamento do QB Time sem significado: saem do caminho.
CREATE TABLE IF NOT EXISTS wp_rule_generic_folder (name text PRIMARY KEY);
INSERT INTO wp_rule_generic_folder VALUES ('address (new)'), ('archived'), ('job sites'), ('jobsites')
ON CONFLICT DO NOTHING;

-- Prefixo de pasta → cliente canônico. "Pulte Homes (NEW)" vira "Pulte Homes".
CREATE TABLE IF NOT EXISTS wp_rule_client (
  prefix text PRIMARY KEY, -- minúsculas
  client text NOT NULL
);
INSERT INTO wp_rule_client VALUES ('pulte homes', 'Pulte Homes'), ('toll brothers', 'Toll Brothers'), ('callahan', 'Callahan')
ON CONFLICT DO NOTHING;

-- Empresa ou departamento depois de um work type ("TRANSPORT / Framing"): diz
-- quem, não onde. Essas horas não têm job site.
CREATE TABLE IF NOT EXISTS wp_rule_org_segment (name text PRIMARY KEY);
INSERT INTO wp_rule_org_segment VALUES ('framing'), ('pcg'), ('hvac'), ('office')
ON CONFLICT DO NOTHING;

-- Work types descartados de tudo (o importador já descartava "Service Call").
CREATE TABLE IF NOT EXISTS wp_rule_excluded_worktype (name text PRIMARY KEY);
INSERT INTO wp_rule_excluded_worktype VALUES ('Service Call') ON CONFLICT DO NOTHING;

-- Grafias do mesmo job site → nome único. Substitui as quatro camadas de
-- semelhança da página; abastecida uma vez e corrigível no settings.
CREATE TABLE IF NOT EXISTS wp_rule_jobsite_alias (
  alias_key text PRIMARY KEY, -- job site normalizado, minúsculas
  jobsite   text NOT NULL
);

-- Job site do QB Time → job site do Forecast, para dividir as horas sem lote
-- entre os lotes ativos quando a equipe não lançou em lote nenhum.
CREATE TABLE IF NOT EXISTS wp_rule_jobsite_forecast (
  jobsite           text PRIMARY KEY,
  forecast_job_site text NOT NULL
);

-- ── Funções do tratamento ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION wp_worktype(s text) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT canonical FROM wp_rule_worktype_alias WHERE alias = lower(btrim(s))
$$;

-- Endereço: um espaço depois de vírgula, sem espaço duplo, sem o estado no fim
-- (", RI"), cada palavra com a primeira letra maiúscula.
CREATE OR REPLACE FUNCTION wp_norm_address(s text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(string_agg(upper(left(w, 1)) || lower(substr(w, 2)), ' ' ORDER BY i), '')
  FROM regexp_split_to_table(
         regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(s, '')), '\s*,\s*', ', ', 'g'),
                                       '\s{2,}', ' ', 'g'), ',\s*[A-Za-z]{2}$', ''),
         '\s+') WITH ORDINALITY AS t(w, i)
  WHERE w <> ''
$$;

-- Lote: "Lot 04" → "LOT 4", "bldg 8" / "Building08" → "Building 8".
CREATE OR REPLACE FUNCTION wp_norm_lot(s text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(regexp_replace(btrim(coalesce(s, '')),
           '^lot\s*0*(\d+)', 'LOT \1', 'i'),
           '^(building|bldg)\s*0*(\d+)', 'Building \2', 'i')
$$;

-- search_path fixo: o Postgres 17 roda a view materializada com search_path
-- restrito, e sem isto as funções não acham as tabelas de regra.
-- O caminho do QB Time (raiz → folha) vira cliente, job site, lote e work type.
-- Mesmas regras do parser do importador (parseJobcodePath), agora num lugar só.
CREATE OR REPLACE FUNCTION wp_parse_path(p jsonb, OUT client text, OUT jobsite text, OUT lot text, OUT worktype text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  segs text[] := '{}';
  rest text[];
  s text;
  c text;
  n int;
  wi int := 0;
BEGIN
  client := ''; jobsite := ''; lot := ''; worktype := '';
  FOR s IN SELECT btrim(x) FROM jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) x LOOP
    CONTINUE WHEN s = '' OR s ~ '^\d+\s*[º°ª]$'
              OR EXISTS (SELECT 1 FROM wp_rule_generic_folder g WHERE g.name = lower(s));
    segs := segs || s;
  END LOOP;
  n := coalesce(array_length(segs, 1), 0);
  IF n = 0 THEN RETURN; END IF;

  -- Cliente na raiz.
  SELECT r.client INTO c FROM wp_rule_client r WHERE lower(segs[1]) LIKE r.prefix || '%' LIMIT 1;
  IF c IS NOT NULL THEN
    client := c; segs := segs[2:n]; n := n - 1;
  END IF;
  -- Cliente no fim é engano de cadastro: vai para cliente.
  IF n >= 1 THEN
    c := NULL;
    SELECT r.client INTO c FROM wp_rule_client r WHERE lower(segs[n]) LIKE r.prefix || '%' LIMIT 1;
    IF c IS NOT NULL THEN
      IF client = '' THEN client := c; END IF;
      segs := segs[1:n - 1]; n := n - 1;
    END IF;
  END IF;
  IF n = 0 THEN RETURN; END IF;

  IF n >= 2 AND wp_worktype(segs[1]) IS NOT NULL THEN
    -- Work type na frente: ["Maintenance", "33 Scott St"].
    worktype := wp_worktype(segs[1]);
    IF NOT EXISTS (SELECT 1 FROM wp_rule_org_segment o WHERE o.name = lower(segs[2])) THEN
      jobsite := segs[2];
    END IF;
  ELSIF n >= 2 AND EXISTS (SELECT 1 FROM wp_rule_org_segment o WHERE o.name = lower(segs[1])) THEN
    -- Empresa e depois work type: ["Framing", "Transport"].
    worktype := coalesce(wp_worktype(segs[2]), segs[2]);
  ELSIF n = 1 THEN
    IF wp_worktype(segs[1]) IS NOT NULL THEN worktype := wp_worktype(segs[1]); ELSE jobsite := segs[1]; END IF;
  ELSE
    -- Padrão: job site na posição 0; o último work type conhecido do resto é o
    -- work type, e o que sobra é o lote.
    jobsite := segs[1];
    rest := segs[2:n];
    FOR i IN REVERSE array_length(rest, 1)..1 LOOP
      IF wp_worktype(rest[i]) IS NOT NULL THEN wi := i; EXIT; END IF;
    END LOOP;
    IF wi > 0 THEN
      worktype := wp_worktype(rest[wi]);
      lot := array_to_string(rest[1:wi - 1] || rest[wi + 1:array_length(rest, 1)], ' > ');
    ELSIF rest[array_length(rest, 1)] ~* '\m(lot|building|bldg|unit)\s*\d' THEN
      lot := array_to_string(rest, ' > ');
    ELSE
      worktype := rest[array_length(rest, 1)];
      lot := array_to_string(rest[1:array_length(rest, 1) - 1], ' > ');
    END IF;
  END IF;

  -- Work type que é cliente, endereço ou vazio de sentido conta como trabalho normal.
  IF worktype ~ '^\d+\s+[A-Za-z]' OR EXISTS (SELECT 1 FROM wp_rule_client r WHERE lower(worktype) LIKE r.prefix || '%') THEN
    worktype := 'Normal Labor';
  END IF;
END
$$;

-- ── Views ─────────────────────────────────────────────────────────────────────

-- Uma linha por lançamento do QB Time, já com obra e empresa. A conta
-- "hvacing" é cópia da Framing (conferido em 04/11/2026) e fica de fora.
CREATE OR REPLACE VIEW v_wp_entries AS
WITH parsed AS (
  SELECT t.company AS account, t.qbt_id, t.user_name AS employee, t.work_date,
         t.duration_min / 60.0 AS hours, t.type, t.jobcode_path,
         p.client, wp_norm_address(p.jobsite) AS jobsite_norm, wp_norm_lot(p.lot) AS lot, p.worktype
  FROM qbtime_timesheets t
  CROSS JOIN LATERAL wp_parse_path(t.jobcode_path) p
  WHERE t.company IN ('framing', 'hvac', 'pcg') AND t.duration_min > 0
), named AS (
  SELECT p.*,
         coalesce(a.jobsite, p.jobsite_norm) AS jobsite,
         CASE p.account WHEN 'framing' THEN 'Framing' WHEN 'hvac' THEN 'HVAC' ELSE 'PCG' END AS raw_company
  FROM parsed p
  LEFT JOIN wp_rule_jobsite_alias a ON a.alias_key = lower(p.jobsite_norm)
  WHERE NOT EXISTS (SELECT 1 FROM wp_rule_excluded_worktype x WHERE lower(x.name) = lower(p.worktype))
)
SELECT n.account, n.qbt_id, n.employee, n.work_date, n.hours, n.type, n.jobcode_path,
       n.client, n.jobsite, n.lot,
       CASE WHEN n.lot ~ '^Building \d+' THEN substring(n.lot FROM '^Building \d+') ELSE '' END AS building,
       n.worktype,
       -- Regras de atribuição: a primeira que casa muda a empresa, uma vez só.
       coalesce((
         SELECT r.target_company FROM workforce_attribution_rules r
         WHERE (coalesce(r.conditions->>'company', '') = '' OR lower(r.conditions->>'company') = lower(n.raw_company))
           AND (coalesce(r.conditions->>'client', '') = '' OR lower(r.conditions->>'client') = lower(n.client))
           AND (coalesce(r.conditions->>'jobsite', '') = '' OR lower(r.conditions->>'jobsite') = lower(n.jobsite))
           AND (coalesce(r.conditions->>'worktype', '') = '' OR lower(r.conditions->>'worktype') = lower(n.worktype))
         ORDER BY r.created_at LIMIT 1), n.raw_company) AS company
FROM named n
-- Na PCG só contam as horas da Callahan (o importador comparava o nome exato e
-- perdia "Callahan (NEW)").
WHERE n.account <> 'pcg' OR n.client = 'Callahan';

-- Regular e overtime (WF-18, ponto 9): por funcionário e semana (segunda a
-- domingo), de segunda a sexta as primeiras 40 h são regulares e o resto é
-- extra; sábado e domingo são extra sempre. Work type que não fecha as 40 h
-- (settings) não é regular nem extra.
CREATE OR REPLACE VIEW v_wp_split AS
WITH flagged AS (
  SELECT e.*,
         NOT (lower(e.worktype) = ANY (SELECT lower(x) FROM wp_insights_settings, unnest(non_counting_worktypes) x)) AS counted,
         extract(isodow FROM e.work_date) >= 6 AS weekend
  FROM v_wp_entries e
), running AS (
  SELECT f.*,
         coalesce(sum(f.hours) FILTER (WHERE f.counted AND NOT f.weekend) OVER (
           PARTITION BY f.account, f.employee, date_trunc('week', f.work_date)
           ORDER BY f.work_date, f.qbt_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
  FROM flagged f
)
SELECT r.account, r.qbt_id, r.employee, r.work_date, r.hours, r.type, r.client, r.jobsite, r.lot, r.building,
       r.worktype, r.company, r.counted,
       CASE WHEN NOT r.counted OR r.weekend THEN 0 ELSE least(r.hours, greatest(0, 40 - r.before)) END AS regular,
       CASE WHEN NOT r.counted THEN 0 WHEN r.weekend THEN r.hours
            ELSE r.hours - least(r.hours, greatest(0, 40 - r.before)) END AS overtime
FROM running r;

-- Horas só no job site, sem lote, divididas entre os lotes (decisão do Vitor,
-- 04/11/2026): pela proporção das horas da equipe nos lotes no mesmo dia, senão
-- na mesma semana, no mesmo mês, no mês vizinho; sem nada disso, por igual entre
-- os lotes ativos do Forecast naquela data. Regular e overtime seguem a fatia.
CREATE OR REPLACE VIEW v_wp_allocated AS
WITH lotted AS (
  SELECT company, jobsite, lot, work_date, hours FROM v_wp_split WHERE jobsite <> '' AND lot <> ''
), bare AS (
  SELECT * FROM v_wp_split WHERE jobsite <> '' AND lot = ''
), weights AS (
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours) AS w, 1 AS lvl
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite AND l.work_date = b.work_date
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 2
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND date_trunc('week', l.work_date) = date_trunc('week', b.work_date)
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 3
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND date_trunc('month', l.work_date) = date_trunc('month', b.work_date)
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 4
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND l.work_date >= date_trunc('month', b.work_date) - interval '1 month'
   AND l.work_date <  date_trunc('month', b.work_date) + interval '2 month'
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account,
         wp_norm_lot(CASE WHEN fc.type = 'Building' THEN 'Building ' ELSE 'Lot ' END || fc.lote_bld), 1.0, 5
  FROM bare b
  JOIN wp_rule_jobsite_forecast m ON m.jobsite = b.jobsite
  JOIN forecast_core fc ON fc.job_site = m.forecast_job_site AND lower(fc.company) = lower(b.company)
   AND fc.previous_start_date <= b.work_date AND coalesce(fc.previous_end_date, b.work_date) >= b.work_date
   AND coalesce(fc.lote_bld, '') <> ''
), best AS (
  SELECT qbt_id, account, min(lvl) AS lvl FROM weights GROUP BY 1, 2
), shares AS (
  SELECT w.qbt_id, w.account, w.lot, w.w / sum(w.w) OVER (PARTITION BY w.qbt_id, w.account) AS share
  FROM weights w JOIN best USING (qbt_id, account, lvl)
)
SELECT s.account, s.qbt_id, s.employee, s.work_date, s.hours, s.type, s.client, s.jobsite, s.lot, s.building,
       s.worktype, s.company, s.counted, s.regular, s.overtime, false AS allocated
FROM v_wp_split s
WHERE NOT (s.jobsite <> '' AND s.lot = '' AND EXISTS (SELECT 1 FROM best b WHERE b.qbt_id = s.qbt_id AND b.account = s.account))
UNION ALL
SELECT b.account, b.qbt_id, b.employee, b.work_date, b.hours * sh.share, b.type, b.client, b.jobsite, sh.lot,
       CASE WHEN sh.lot ~ '^Building \d+' THEN substring(sh.lot FROM '^Building \d+') ELSE '' END,
       b.worktype, b.company, b.counted, b.regular * sh.share, b.overtime * sh.share, true
FROM bare b JOIN shares sh ON sh.qbt_id = b.qbt_id AND sh.account = b.account;

-- A que a página lê. Atualizada depois de cada sincronização do QB Time e de
-- cada mudança no settings que mexe na conta.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_wp_hours AS SELECT * FROM v_wp_allocated;
CREATE INDEX IF NOT EXISTS mv_wp_hours_company_date ON mv_wp_hours (company, work_date);
