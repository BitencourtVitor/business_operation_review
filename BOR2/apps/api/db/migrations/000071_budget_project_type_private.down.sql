UPDATE budget_categories         SET project_type = 'house' WHERE project_type = 'private';
UPDATE budget_account_categories SET project_type = 'house' WHERE project_type = 'private';
UPDATE budget_vendor_categories  SET project_type = 'house' WHERE project_type = 'private';
