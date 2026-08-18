CREATE TABLE IF NOT EXISTS forecast_obs_history (
    id          BIGSERIAL   PRIMARY KEY,
    project_id  TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    author_id   TEXT        NOT NULL DEFAULT '',
    author_name TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_obs_history_project
    ON forecast_obs_history (LOWER(project_id), created_at DESC, id DESC);
