-- Lote padrão do job site (WF-19): hora lançada só no job site, sem lote,
-- assume este lote antes de qualquer rateio. Ex.: no QB Time, Baldwinville não
-- tem pasta de prédio, mas a obra inteira é o Building 1 (Vitor, 04/11/2026).
CREATE TABLE IF NOT EXISTS wp_rule_jobsite_lot (
  jobsite text PRIMARY KEY,
  lot     text NOT NULL
);
INSERT INTO wp_rule_jobsite_lot VALUES ('Baldwinville Scholl', 'Building 1') ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW v_wp_entries AS
WITH parsed AS (
  SELECT t.company AS account, t.qbt_id, t.user_name AS employee, t.work_date,
         t.duration_min / 60.0 AS hours, t.type, t.jobcode_path,
         p.client, wp_norm_address(p.jobsite) AS jobsite_norm, wp_norm_lot(p.lot) AS lot, p.worktype
  FROM qbtime_timesheets t
  CROSS JOIN LATERAL wp_parse_path(t.jobcode_path) p
  WHERE t.company IN ('framing', 'hvac', 'pcg') AND t.duration_min > 0
), named AS (
  SELECT p.account, p.qbt_id, p.employee, p.work_date, p.hours, p.type, p.jobcode_path, p.client,
         p.jobsite_norm, coalesce(nullif(p.lot, ''), d.lot, '') AS lot, p.worktype,
         coalesce(a.jobsite, p.jobsite_norm) AS jobsite,
         CASE p.account WHEN 'framing' THEN 'Framing' WHEN 'hvac' THEN 'HVAC' ELSE 'PCG' END AS raw_company
  FROM parsed p
  LEFT JOIN wp_rule_jobsite_alias a ON a.alias_key = lower(p.jobsite_norm)
  LEFT JOIN wp_rule_jobsite_lot d ON lower(d.jobsite) = lower(coalesce(a.jobsite, p.jobsite_norm))
  WHERE NOT EXISTS (SELECT 1 FROM wp_rule_excluded_worktype x WHERE lower(x.name) = lower(p.worktype))
)
SELECT n.account, n.qbt_id, n.employee, n.work_date, n.hours, n.type, n.jobcode_path,
       n.client, n.jobsite, n.lot,
       CASE WHEN n.lot ~ '^Building \d+' THEN substring(n.lot FROM '^Building \d+') ELSE '' END AS building,
       n.worktype,
       coalesce((
         SELECT r.target_company FROM workforce_attribution_rules r
         WHERE (coalesce(r.conditions->>'company', '') = '' OR lower(r.conditions->>'company') = lower(n.raw_company))
           AND (coalesce(r.conditions->>'client', '') = '' OR lower(r.conditions->>'client') = lower(n.client))
           AND (coalesce(r.conditions->>'jobsite', '') = '' OR lower(r.conditions->>'jobsite') = lower(n.jobsite))
           AND (coalesce(r.conditions->>'worktype', '') = '' OR lower(r.conditions->>'worktype') = lower(n.worktype))
         ORDER BY r.created_at LIMIT 1), n.raw_company) AS company
FROM named n
WHERE n.account <> 'pcg' OR n.client = 'Callahan';

REFRESH MATERIALIZED VIEW mv_wp_hours;
