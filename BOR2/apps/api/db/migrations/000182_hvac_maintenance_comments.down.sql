ALTER TABLE hvac_maintenance_contracts ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
UPDATE hvac_maintenance_contracts c SET notes = s.body
FROM (SELECT DISTINCT ON (contract_id) contract_id, body FROM hvac_maintenance_comments ORDER BY contract_id, created_at, id) s
WHERE s.contract_id = c.id;
DROP TABLE IF EXISTS hvac_maintenance_comments;
