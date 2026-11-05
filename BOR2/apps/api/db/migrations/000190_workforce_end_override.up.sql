ALTER TABLE wp_building_links ADD COLUMN IF NOT EXISTS end_override date;

COMMENT ON COLUMN wp_building_links.end_override IS 'Expected end indicado à mão no settings da Workforce Productivity; quando preenchido, vale no lugar do previous_end_date do Forecast.';
