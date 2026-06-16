-- Budget Control config. The projected-cost source is still being defined with
-- Premium; for now "projected to spend" = projected revenue × cost_ratio
-- (margin-over-estimate). budget_source documents the chosen source so it can be
-- swapped later (e.g. 'purchase_order', 'manual') without a schema change.
CREATE TABLE IF NOT EXISTS qb_budget_settings (
  company             text        NOT NULL PRIMARY KEY,
  cost_ratio          numeric     NOT NULL DEFAULT 0.70,
  budget_source       text        NOT NULL DEFAULT 'estimate_margin',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO qb_budget_settings (company, cost_ratio) VALUES
  ('framing', 0.70), ('hvac', 0.70), ('pcg', 0.70)
ON CONFLICT (company) DO NOTHING;
