-- New last Fieldwire step "Markup" for Pulte Homes Lots only.
-- Toll Brothers is explicitly excluded — Fieldwire markup doesn't apply there.
-- Fallback is false for every lot; checked off one by one by whoever owns it.

INSERT INTO catalog_forecast_fieldwire (id, client, type, document, where_location, notes, created_at)
SELECT COALESCE(MAX(id), 0) + 1, 'Pulte Homes', 'Lot', 'Markup', '', '', NOW()
FROM catalog_forecast_fieldwire;

-- category uses the legacy "Pulte Homes - House" label (plain hyphen) to match
-- the existing grouping already shown for this client's Lot-type Fieldwire
-- docs in the UI — not "Pulte Homes – Lot", which the seedFieldwireDocs
-- formula would produce and which doesn't match anything on screen today.
WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_fieldwire)
INSERT INTO forecast_fieldwire (id, project_id, category, document, status)
SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY fc.id),
       fc.id,
       'Pulte Homes - House',
       'Markup',
       false
FROM forecast_core fc, max_id
WHERE LOWER(fc.cliente) = 'pulte homes'
  AND LOWER(fc.type) = 'lot'
  AND NOT EXISTS (
    SELECT 1 FROM forecast_fieldwire ff
    WHERE ff.project_id = fc.id AND ff.document = 'Markup'
  );
