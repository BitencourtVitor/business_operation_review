-- Simplified Monthly Execution History table
-- Focused only on the status and timing of planned projects
CREATE TABLE IF NOT EXISTS public.monthly_execution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id TEXT NOT NULL,
    reference_month INTEGER NOT NULL, -- The month being executed
    reference_year INTEGER NOT NULL,
    
    -- Status and dates (The only things that matter for execution tracking)
    actual_status TEXT, -- Current status in forecast_data ('In Progress', 'Completed', 'Not Started', etc)
    actual_start_date DATE, -- The actual start date in forecast_data
    reason TEXT, -- Explanation for the execution status
    
    capture_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to avoid duplicate history for the same project/month
    CONSTRAINT unique_execution_obra_month_year UNIQUE (obra_id, reference_month, reference_year)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_execution_history_reference ON public.monthly_execution_history (reference_month, reference_year);
