DROP TABLE IF EXISTS atlas_policy;
ALTER TABLE atlas_annotation DROP CONSTRAINT IF EXISTS atlas_annotation_tool_check;
ALTER TABLE atlas_annotation
    ADD CONSTRAINT atlas_annotation_tool_check
    CHECK (tool = ANY (ARRAY['pen'::text, 'highlighter'::text, 'link'::text]));
ALTER TABLE atlas_sheet
    DROP COLUMN IF EXISTS scale_units_per_pt,
    DROP COLUMN IF EXISTS scale_label,
    DROP COLUMN IF EXISTS scale_unit,
    DROP COLUMN IF EXISTS scale_source;
