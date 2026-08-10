-- Divisions become their own thing, and a subcontractor can belong to several.
--
-- Until now "division" on this page was the company_name enum ('hvac','framing',
-- 'pcg'), single-valued. Two problems with keeping it: Cruz Solutions Inc really
-- does work for framing and pcg, and Fisher Lane and Pleasant Park are divisions
-- of this page only — adding them to company_name would spill two empty options
-- into every financial and workforce screen that reads that enum.
--
-- Each division also carries its own list of standard documents, so the doc type
-- catalog stops being global.

CREATE TABLE IF NOT EXISTS sub_doc_divisions (
    key         text PRIMARY KEY,
    label       text NOT NULL,
    sort_order  int  NOT NULL DEFAULT 0
);

INSERT INTO sub_doc_divisions (key, label, sort_order) VALUES
    ('framing',       'Framing',       1),
    ('hvac',          'HVAC',          2),
    ('pcg',           'PCG',           3),
    ('fisher-lane',   'Fisher Lane',   4),
    ('pleasant-park', 'Pleasant Park', 5)
ON CONFLICT (key) DO NOTHING;

-- ── Which divisions a subcontractor serves ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_doc_contractor_divisions (
    contractor_id int  NOT NULL REFERENCES sub_doc_contractors(id) ON DELETE CASCADE,
    division      text NOT NULL REFERENCES sub_doc_divisions(key) ON DELETE CASCADE,
    PRIMARY KEY (contractor_id, division)
);

-- Carry over what the single company column already said.
INSERT INTO sub_doc_contractor_divisions (contractor_id, division)
SELECT id, company::text FROM sub_doc_contractors WHERE company IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── Which documents each division requires ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_doc_type_divisions (
    doc_type  text NOT NULL REFERENCES sub_doc_types(key) ON DELETE CASCADE,
    division  text NOT NULL REFERENCES sub_doc_divisions(key) ON DELETE CASCADE,
    PRIMARY KEY (doc_type, division)
);

-- The list was global, so every division starts from the same seven and is
-- trimmed from there — the alternative is five divisions requiring nothing.
INSERT INTO sub_doc_type_divisions (doc_type, division)
SELECT t.key, d.key FROM sub_doc_types t CROSS JOIN sub_doc_divisions d
ON CONFLICT DO NOTHING;

-- ── A record now belongs to a (contractor, division, doc type) ──────────────
-- '' is "no division yet", which is what a contractor with no company had. It is
-- a real value rather than NULL so the unique index keeps working: NULLs are
-- distinct from each other, so a NULL division would let duplicates through.
ALTER TABLE sub_doc_records ADD COLUMN IF NOT EXISTS division text NOT NULL DEFAULT '';

UPDATE sub_doc_records r
   SET division = COALESCE(c.company::text, '')
  FROM sub_doc_contractors c
 WHERE c.id = r.contractor_id AND r.division = '';

ALTER TABLE sub_doc_records DROP CONSTRAINT IF EXISTS sub_doc_records_contractor_id_doc_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_doc_records_unique
    ON sub_doc_records (contractor_id, division, doc_type);
