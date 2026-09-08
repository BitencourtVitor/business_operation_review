-- A volta devolve a brecha, mas não devolve as linhas apagadas.
ALTER TABLE atlas_event ALTER COLUMN sheet_id DROP NOT NULL;
ALTER TABLE atlas_event DROP CONSTRAINT IF EXISTS atlas_event_sheet_id_fkey;
ALTER TABLE atlas_event
    ADD CONSTRAINT atlas_event_sheet_id_fkey
    FOREIGN KEY (sheet_id) REFERENCES atlas_sheet(id) ON DELETE SET NULL;
