-- Where the document actually is. The record already said it exists and when it
-- expires, but not where to find it, so the SharePoint link lived in somebody's
-- head or in the notes field.
ALTER TABLE sub_doc_records ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT '';
