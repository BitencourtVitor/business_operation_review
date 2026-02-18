-- Create forecast_contracts table to group steps by contract
CREATE TABLE IF NOT EXISTS public.forecast_contracts (
    id BIGSERIAL PRIMARY KEY,
    obra_id TEXT NOT NULL REFERENCES public.forecast_data(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add contract_id to forecast_contract_steps to link steps to a specific contract
ALTER TABLE public.forecast_contract_steps 
ADD COLUMN IF NOT EXISTS contract_id BIGINT REFERENCES public.forecast_contracts(id) ON DELETE CASCADE;

-- Add team column to forecast_fieldwire and forecast_machines
ALTER TABLE public.forecast_fieldwire ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE public.forecast_machines ADD COLUMN IF NOT EXISTS team TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_forecast_contracts_obra_id ON public.forecast_contracts(obra_id);
CREATE INDEX IF NOT EXISTS idx_forecast_contract_steps_contract_id ON public.forecast_contract_steps(contract_id);
