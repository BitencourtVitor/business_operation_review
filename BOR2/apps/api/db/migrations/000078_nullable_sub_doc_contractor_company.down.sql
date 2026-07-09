ALTER TABLE sub_doc_contractors
  ALTER COLUMN company TYPE text USING company::text;

UPDATE sub_doc_contractors SET company = 'framing' WHERE company IS NULL;

ALTER TABLE sub_doc_contractors ALTER COLUMN company SET NOT NULL;
