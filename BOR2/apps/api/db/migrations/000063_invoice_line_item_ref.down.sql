DROP INDEX IF EXISTS idx_qb_invoice_lines_item;
ALTER TABLE qb_invoice_lines
    DROP COLUMN IF EXISTS item_ref_id,
    DROP COLUMN IF EXISTS item_ref_name;
