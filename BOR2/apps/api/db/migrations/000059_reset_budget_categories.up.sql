-- Replace the generic starter categories (seeded in 000058) with Premium's real
-- Budget Control categories. Building and house each have 4. Cost is driven by
-- subcontractor→category mapping; the generic account auto-mappings are dropped
-- with the old categories (cascade) and will be re-established against the new
-- taxonomy via the management UI.
DELETE FROM budget_categories;  -- cascades account/vendor mappings + project limits

INSERT INTO budget_categories (project_type, name, icon, sort_order) VALUES
  ('building','Structural','Frame',10),
  ('building','Units','LayoutGrid',20),
  ('building','Tyvek','Layers',30),
  ('building','Drop Ceiling','PanelTop',40),
  ('house','Structural','Frame',10),
  ('house','Deck','SquareStack',20),
  ('house','Trim','Ruler',30),
  ('house','Posts','Columns3',40)
ON CONFLICT (project_type, name) DO NOTHING;
