-- Drop the existing foreign key constraint from operational_forecast_index
ALTER TABLE public.operational_forecast_index 
DROP CONSTRAINT IF EXISTS operational_forecast_index_obra_id_fkey;

-- Note: We keep the obra_id column as TEXT so it can still store the ID 
-- from forecast_data, but without the database enforcing the relationship.
