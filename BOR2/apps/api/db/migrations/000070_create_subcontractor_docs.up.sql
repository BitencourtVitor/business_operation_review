-- Subcontractor Docs: tracks compliance document status/expiry per subcontractor
-- (insurance certificates, W-9, master contract, ID, policy binder), replacing
-- Amanda's manual "COI Subcontractors" spreadsheet.
CREATE TABLE IF NOT EXISTS sub_doc_types (
    key         text PRIMARY KEY,
    label       text NOT NULL,
    has_expiry  boolean NOT NULL DEFAULT false, -- true for insurance-type docs tracked by start/expiry date
    sort_order  int NOT NULL DEFAULT 0
);

INSERT INTO sub_doc_types (key, label, has_expiry, sort_order) VALUES
    ('gl_insurance',   'General Liability Insurance ($2,000)', true,  1),
    ('auto_insurance', 'Auto Insurance',                       true,  2),
    ('workers_comp',   'Workers Compensation ($1,000)',        true,  3),
    ('w9',              'W-9',                                 false, 4),
    ('master_contract', 'Master Contract',                     false, 5),
    ('id_photo',        'Photo ID (owner)',                    false, 6),
    ('policy_binder',   'Policy (Binder)',                     false, 7)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS sub_doc_contractors (
    id          serial PRIMARY KEY,
    company     text NOT NULL,
    name        text NOT NULL,
    email       text NOT NULL DEFAULT '',
    phone       text NOT NULL DEFAULT '',
    notes       text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_doc_contractors_company ON sub_doc_contractors (company);

CREATE TABLE IF NOT EXISTS sub_doc_records (
    id              serial PRIMARY KEY,
    contractor_id   int NOT NULL REFERENCES sub_doc_contractors(id) ON DELETE CASCADE,
    doc_type        text NOT NULL REFERENCES sub_doc_types(key),
    status          text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','requested','received','not_applicable')),
    start_date      date,
    expiry_date     date,
    requested_date  date,
    notes           text NOT NULL DEFAULT '',
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contractor_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_sub_doc_records_contractor ON sub_doc_records (contractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_doc_records_expiry ON sub_doc_records (expiry_date) WHERE expiry_date IS NOT NULL;
