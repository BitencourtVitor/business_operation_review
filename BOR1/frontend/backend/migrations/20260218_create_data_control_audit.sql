-- Create Audit Table for Data Control
CREATE TABLE IF NOT EXISTS public.data_control_audit (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    table_name text NOT NULL,
    record_id text NOT NULL,
    operation text NOT NULL, -- INSERT, UPDATE, DELETE
    old_values jsonb,
    new_values jsonb,
    changed_by uuid REFERENCES auth.users(id),
    changed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT data_control_audit_pkey PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_data_control_audit_table_record ON public.data_control_audit(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_data_control_audit_changed_at ON public.data_control_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_control_audit_changed_by ON public.data_control_audit(changed_by);

-- Enable RLS
ALTER TABLE public.data_control_audit ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for authenticated users" ON public.data_control_audit
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.data_control_audit
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Function to handle audit logging
CREATE OR REPLACE FUNCTION public.log_data_control_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.data_control_audit (
        table_name,
        record_id,
        operation,
        old_values,
        new_values,
        changed_by
    )
    VALUES (
        TG_TABLE_NAME,
        CASE
            WHEN TG_OP = 'DELETE' THEN OLD.id::text
            ELSE NEW.id::text
        END,
        TG_OP,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
        auth.uid()
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply triggers to Data Control tables

-- 1. forecast_data
DROP TRIGGER IF EXISTS audit_forecast_data ON public.forecast_data;
CREATE TRIGGER audit_forecast_data
    AFTER INSERT OR UPDATE OR DELETE ON public.forecast_data
    FOR EACH ROW EXECUTE FUNCTION public.log_data_control_changes();

-- 2. forecast_machines
DROP TRIGGER IF EXISTS audit_forecast_machines ON public.forecast_machines;
CREATE TRIGGER audit_forecast_machines
    AFTER INSERT OR UPDATE OR DELETE ON public.forecast_machines
    FOR EACH ROW EXECUTE FUNCTION public.log_data_control_changes();

-- 3. forecast_fieldwire
DROP TRIGGER IF EXISTS audit_forecast_fieldwire ON public.forecast_fieldwire;
CREATE TRIGGER audit_forecast_fieldwire
    AFTER INSERT OR UPDATE OR DELETE ON public.forecast_fieldwire
    FOR EACH ROW EXECUTE FUNCTION public.log_data_control_changes();

-- 4. forecast_contract_steps
DROP TRIGGER IF EXISTS audit_forecast_contract_steps ON public.forecast_contract_steps;
CREATE TRIGGER audit_forecast_contract_steps
    AFTER INSERT OR UPDATE OR DELETE ON public.forecast_contract_steps
    FOR EACH ROW EXECUTE FUNCTION public.log_data_control_changes();
