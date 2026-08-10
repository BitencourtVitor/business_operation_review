-- Business Corporation Register is a standing compliance document. It is not
-- an insurance policy, so it does not carry a policy-expiry date.
INSERT INTO sub_doc_types (key, label, has_expiry, sort_order)
VALUES ('business_corporation_register', 'Business Corporation Register', false, 8)
ON CONFLICT (key) DO NOTHING;

-- The existing document catalog applies to all divisions by default. Keep the
-- new category aligned with that model, while still allowing a division to be
-- opted out later through sub_doc_type_divisions.
INSERT INTO sub_doc_type_divisions (doc_type, division)
SELECT 'business_corporation_register', key FROM sub_doc_divisions
ON CONFLICT DO NOTHING;
