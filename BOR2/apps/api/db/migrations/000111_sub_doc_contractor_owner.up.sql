-- The person who signs for the sub: printed on the contract's "Print Name & Title"
-- line. Separate from `name`, which is the company.
ALTER TABLE sub_doc_contractors
    ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT '';
