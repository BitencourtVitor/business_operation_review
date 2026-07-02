-- Lot projects had no default Contractors Costs categories at all (project_type
-- 'lot' existed as a classification since BC-8/000071, but nothing was ever
-- seeded for it — 'private' inherited the old 'house' set, 'lot' got nothing).
-- Same treatment as building/private: universal starter categories, editable
-- per-project like the rest.
INSERT INTO budget_categories (project_type, name, icon, sort_order)
VALUES
  ('lot', 'Structural', 'Frame', 10),
  ('lot', 'Add-ons', 'PackagePlus', 20)
ON CONFLICT (project_type, name) DO NOTHING;
