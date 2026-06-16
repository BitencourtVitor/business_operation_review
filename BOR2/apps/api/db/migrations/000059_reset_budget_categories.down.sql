DELETE FROM budget_categories
WHERE (project_type, name) IN (
  ('building','Structural'), ('building','Units'), ('building','Tyvek'), ('building','Drop Ceiling'),
  ('house','Structural'), ('house','Deck'), ('house','Trim'), ('house','Posts')
);
