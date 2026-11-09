-- Horas só no job site, sem lote (WF-26, decisão do Vitor, 09/11/2026): seguem primeiro o
-- histórico do próprio funcionário, pela proporção das horas dele com lote naquele job site.
-- Sem histórico dele ali, vale o rateio pela equipe da 000188 (dia, semana, mês, mês vizinho,
-- Forecast), mas nunca para prédio: quem nunca lançou num prédio não cai nele.
-- ponytail: o histórico é o de todo o período; recortar por data se pesar errado.
CREATE OR REPLACE VIEW v_wp_allocated AS
WITH lotted AS (
  SELECT account, employee, company, jobsite, lot, work_date, hours FROM v_wp_split WHERE jobsite <> '' AND lot <> ''
), bare AS (
  SELECT * FROM v_wp_split WHERE jobsite <> '' AND lot = ''
), weights AS (
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours) AS w, 0 AS lvl
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND l.account = b.account AND l.employee = b.employee
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 1
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite AND l.work_date = b.work_date AND l.lot !~ '^Building'
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 2
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND date_trunc('week', l.work_date) = date_trunc('week', b.work_date) AND l.lot !~ '^Building'
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 3
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND date_trunc('month', l.work_date) = date_trunc('month', b.work_date) AND l.lot !~ '^Building'
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account, l.lot, sum(l.hours), 4
  FROM bare b JOIN lotted l ON l.company = b.company AND l.jobsite = b.jobsite
   AND l.work_date >= date_trunc('month', b.work_date) - interval '1 month'
   AND l.work_date <  date_trunc('month', b.work_date) + interval '2 month' AND l.lot !~ '^Building'
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT b.qbt_id, b.account,
         wp_norm_lot(CASE WHEN fc.type = 'Building' THEN 'Building ' ELSE 'Lot ' END || fc.lote_bld), 1.0, 5
  FROM bare b
  JOIN wp_rule_jobsite_forecast m ON m.jobsite = b.jobsite
  JOIN forecast_core fc ON fc.job_site = m.forecast_job_site AND lower(fc.company) = lower(b.company)
   AND fc.previous_start_date <= b.work_date AND coalesce(fc.previous_end_date, b.work_date) >= b.work_date
   AND coalesce(fc.lote_bld, '') <> '' AND fc.type IS DISTINCT FROM 'Building'
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

REFRESH MATERIALIZED VIEW mv_wp_hours;
