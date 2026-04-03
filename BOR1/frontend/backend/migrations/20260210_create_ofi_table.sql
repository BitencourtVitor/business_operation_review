-- Create the Operational Forecast Index table
CREATE TABLE IF NOT EXISTS public.operational_forecast_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id TEXT NOT NULL REFERENCES public.forecast_data(id) ON DELETE CASCADE,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    capture_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Partial scores (0 to 2 for these three)
    fieldwire_score NUMERIC(3,2) DEFAULT 0,
    machines_score NUMERIC(3,2) DEFAULT 0,
    contract_score NUMERIC(3,2) DEFAULT 0,
    
    -- Systems score (0 to 1)
    systems_score NUMERIC(3,2) DEFAULT 0,
    
    -- Total score (0 to 7)
    total_score NUMERIC(3,2) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to avoid duplicate snapshots for the same project/month
    CONSTRAINT unique_obra_month_year UNIQUE (obra_id, reference_month, reference_year)
);

-- Index for faster queries by month/year
CREATE INDEX IF NOT EXISTS idx_ofi_reference ON public.operational_forecast_index (reference_month, reference_year);
