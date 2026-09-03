DELETE FROM atlas_annotation WHERE tool = 'link';

ALTER TABLE atlas_annotation DROP CONSTRAINT IF EXISTS atlas_annotation_tool_check;

ALTER TABLE atlas_annotation
  ADD CONSTRAINT atlas_annotation_tool_check
  CHECK (tool = ANY (ARRAY['pen'::text, 'highlighter'::text]));
