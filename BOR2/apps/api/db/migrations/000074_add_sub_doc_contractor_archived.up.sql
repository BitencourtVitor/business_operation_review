-- SD-3: archive control per subcontractor — archived contractors are hidden
-- from the default list but their document history is kept, not deleted.
ALTER TABLE sub_doc_contractors ADD COLUMN archived boolean NOT NULL DEFAULT false;
