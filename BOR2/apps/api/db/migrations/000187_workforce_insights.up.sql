-- Workforce Productivity (WF-18): parâmetros do settings, supervisores e o
-- vínculo de cada prédio do Forecast com a obra equivalente no QB Time.

-- Uma linha só: o orçamento padrão de mão de obra de supervisor por prédio e as
-- duas listas de work types.
--   ignored_worktypes: ficam fora das análises de obra e prédio (Panels, folgas).
--   non_counting_worktypes: não fecham as 40 h da semana (Sick, almoço). Holiday
--   fecha, por isso não está aqui.
CREATE TABLE IF NOT EXISTS wp_insights_settings (
  id                     int     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  building_budget        numeric NOT NULL DEFAULT 32000 CHECK (building_budget >= 0),
  ignored_worktypes      text[]  NOT NULL DEFAULT '{}',
  non_counting_worktypes text[]  NOT NULL DEFAULT '{}'
);

INSERT INTO wp_insights_settings (id, building_budget, ignored_worktypes, non_counting_worktypes)
VALUES (1, 32000,
        ARRAY['Panels', 'Sick', 'Holiday', 'Lunch Break', 'Lunch Break Office', 'Vacation Unpaid', 'Office', 'Transport'],
        ARRAY['Sick', 'Lunch Break', 'Lunch Break Office', 'Vacation Unpaid'])
ON CONFLICT (id) DO NOTHING;

-- Supervisores da Premium. O nome é o do QB Time, como chega na importação.
CREATE TABLE IF NOT EXISTS wp_supervisors (
  employee_name text PRIMARY KEY
);

-- Todo prédio do Forecast aparece no settings; só a ponta do QB Time é
-- alimentada: o job site e o número do Building ("Building 1"), que juntam
-- todos os andares ("Building 1 > 3º").
CREATE TABLE IF NOT EXISTS wp_building_links (
  forecast_id  text PRIMARY KEY REFERENCES forecast_core(id) ON DELETE CASCADE,
  qbt_jobsite  text NOT NULL,
  qbt_building text NOT NULL
);

-- Mapeamento inicial conferido pelo Vitor em 04/11/2026.
INSERT INTO wp_building_links (forecast_id, qbt_jobsite, qbt_building)
SELECT f.id, v.jobsite, v.building
FROM (VALUES
  ('Burke Street and Ingalls Street, Nashua, NH 03060', '1', 'Maynard Homes, Nashua', 'Building 1'),
  ('Riverview at East Point, East Providence, RI',      '2', 'East Providence, Riverview At Providence', 'Building 2'),
  ('Glenford at Lake Williams, Marlborough, MA',        '1', 'Glenford At Lake Williams, Marlborough', 'Building 1'),
  ('Emerald Run at Shrewsbury, MA',                     '1', 'Emerald Run At Shrewsbury', 'Building 1'),
  ('Neponset at Canton, MA',                            '1', 'Canton, Neponset', 'Building 1'),
  ('Chauncy Lake at Westborough, MA',                   '8', 'Westborough, Chauncy Lake', 'Building 8'),
  ('Coppersmith at Canton, MA',                         '1', 'Canton, Coppersmith', 'Building 1')
) AS v(job_site, lote, jobsite, building)
JOIN forecast_core f ON f.company = 'framing' AND f.type = 'Building' AND f.job_site = v.job_site AND f.lote_bld = v.lote
ON CONFLICT (forecast_id) DO NOTHING;
