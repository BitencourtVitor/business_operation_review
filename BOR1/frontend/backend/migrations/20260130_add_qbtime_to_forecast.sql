-- Migration to add qbtime column to forecast_data table
ALTER TABLE forecast_data ADD COLUMN IF NOT EXISTS qbtime BOOLEAN DEFAULT NULL;
