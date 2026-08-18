ALTER TABLE forecast_obs_history
    ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT '';
