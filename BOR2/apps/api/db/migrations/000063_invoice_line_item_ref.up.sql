-- Capture the QB item (and thus its income account) per invoice line, so the
-- Budget Control modal can break income into categories (Sales / Extra / …),
-- mirroring QB "Profit and Loss by Project".
ALTER TABLE qb_invoice_lines
    ADD COLUMN IF NOT EXISTS item_ref_id   TEXT,
    ADD COLUMN IF NOT EXISTS item_ref_name TEXT;

CREATE INDEX IF NOT EXISTS idx_qb_invoice_lines_item ON qb_invoice_lines (company, item_ref_id);
