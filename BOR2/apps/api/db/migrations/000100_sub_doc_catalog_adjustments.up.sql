-- Four catalog adjustments from the 2026-08-13 notes. They all land on
-- sub_doc_types / sub_doc_divisions, so they travel together.

-- ── SD-8: Business Corporation Register leads the list ──────────────────────
-- It is the first thing asked of a new subcontractor, so it stops being the
-- eighth column and becomes the first. sort_order is display only.
UPDATE sub_doc_types SET sort_order = sort_order + 1
 WHERE key <> 'business_corporation_register';
UPDATE sub_doc_types SET sort_order = 1
 WHERE key = 'business_corporation_register';

-- ── SD-9: subdivisions belong to a division for display, and only display ───
-- Fisher Lane and Pleasant Park sit under PCG, but a subcontractor serving a
-- subdivision is NOT thereby a member of the parent division, and the parent's
-- document catalog is NOT inherited. Membership (sub_doc_contractor_divisions)
-- and requirements (sub_doc_type_divisions) stay keyed to the exact division.
--
-- So: never expand a filter, a roster or a catalog lookup through parent_key.
-- It exists so the UI can render "PCG › Pleasant Park", nothing else.
ALTER TABLE sub_doc_divisions
    ADD COLUMN IF NOT EXISTS parent_key text REFERENCES sub_doc_divisions(key) ON DELETE SET NULL;

UPDATE sub_doc_divisions SET parent_key = 'pcg'
 WHERE key IN ('fisher-lane', 'pleasant-park');

-- ── SD-11: W-9 gains the same date pair the insurance documents have ────────
UPDATE sub_doc_types SET has_expiry = true WHERE key = 'w9';

-- ── SD-12: a document type declares which status vocabulary it speaks ───────
-- 'document' is the original missing/requested/received/not_applicable.
-- 'condition' is the Workers' Comp review vocabulary: pending/regular/irregular.
-- Same idea as has_expiry — a flag on the catalog changing how the cell behaves,
-- rather than a second column nobody else fills.
ALTER TABLE sub_doc_types
    ADD COLUMN IF NOT EXISTS status_model text NOT NULL DEFAULT 'document';

ALTER TABLE sub_doc_types DROP CONSTRAINT IF EXISTS sub_doc_types_status_model_check;
ALTER TABLE sub_doc_types ADD CONSTRAINT sub_doc_types_status_model_check
    CHECK (status_model IN ('document', 'condition'));

UPDATE sub_doc_types SET status_model = 'condition'
 WHERE key = 'business_corporation_register';

-- The record status column now has to hold either vocabulary. Which one is
-- valid for a given row is decided by the type's status_model, not here.
ALTER TABLE sub_doc_records DROP CONSTRAINT IF EXISTS sub_doc_records_status_check;
ALTER TABLE sub_doc_records ADD CONSTRAINT sub_doc_records_status_check
    CHECK (status IN ('missing', 'requested', 'received', 'not_applicable',
                      'pending', 'regular', 'irregular'));

-- Translating the existing Business Corporation Register rows to the condition
-- vocabulary is deliberately NOT done here — see 000101. Widening the CHECK is
-- safe ahead of a deploy; writing a value the running frontend cannot render is
-- not, and doing both in one step took the page down once already.
