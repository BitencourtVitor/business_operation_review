-- BC-8: project_type taxonomy expands from 2 values (house/building) to 3
-- (building/lot/private). "house" was the old catch-all fallback; the new
-- fallback is "private" (Lot becomes its own explicit bucket, matched by name
-- prefix at query time in budget_handler.go's projectType()). Data-only —
-- no schema change needed (project_type is a free-text column, no CHECK
-- constraint on any of these three tables).
UPDATE budget_categories         SET project_type = 'private' WHERE project_type = 'house';
UPDATE budget_account_categories SET project_type = 'private' WHERE project_type = 'house';
UPDATE budget_vendor_categories  SET project_type = 'private' WHERE project_type = 'house';
