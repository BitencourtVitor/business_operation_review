-- sub_doc_contractors.company was never real per-subcontractor data: the API
-- hardcoded it to 'framing' for every row (this page wasn't segmented by
-- company yet — see subDocsCompany in subcontractor_docs_handler.go, removed
-- alongside this migration). This turns it into the real thing: nullable,
-- typed as the shared company_name enum (matching every other company
-- column in the app), with the fake values cleared so NULL genuinely means
-- "not yet assigned" — the future company filter's "none of the three" bucket.
ALTER TABLE sub_doc_contractors ALTER COLUMN company DROP NOT NULL;

UPDATE sub_doc_contractors SET company = NULL;

ALTER TABLE sub_doc_contractors
  ALTER COLUMN company TYPE company_name USING company::company_name;
