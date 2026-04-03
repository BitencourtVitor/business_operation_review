-- Create table for workforce monthly notes
CREATE TABLE IF NOT EXISTS public.workforce_monthly_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month)
);

-- Enable RLS
ALTER TABLE public.workforce_monthly_notes ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing authenticated users for now, matching common patterns in this project)
CREATE POLICY "Allow all access for authenticated users" ON public.workforce_monthly_notes
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.workforce_monthly_notes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Comments
COMMENT ON TABLE public.workforce_monthly_notes IS 'Stores monthly notes for the Workforce Productivity page';
COMMENT ON COLUMN public.workforce_monthly_notes.year IS 'The year of the notes';
COMMENT ON COLUMN public.workforce_monthly_notes.month IS 'The month of the notes (1-12)';
COMMENT ON COLUMN public.workforce_monthly_notes.content IS 'The actual text content of the note';
