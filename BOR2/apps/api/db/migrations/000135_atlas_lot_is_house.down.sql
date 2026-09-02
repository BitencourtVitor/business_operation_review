INSERT INTO atlas_doc_category (client, build_type, name, axis, position, default_slot)
SELECT client, 'lot', name, axis, position, default_slot
FROM atlas_doc_category WHERE build_type = 'house'
ON CONFLICT (client, build_type, name) DO NOTHING;
