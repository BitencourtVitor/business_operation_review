-- New Contractors Costs category for buildings: Doors — same treatment as the
-- other universal building categories (Structural, Units, Tyvek, Drop Ceiling).
INSERT INTO budget_categories (project_type, name, icon, sort_order, default_max, active)
VALUES ('building', 'Doors', 'DoorOpen', 40, 100000.00, true)
ON CONFLICT (project_type, name) DO NOTHING;
