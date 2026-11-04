-- Monthly Execution (ME-8): fim real da obra, metas por checkpoint e pontos de melhoria.

-- Fim real: o dia em que a obra passou para closed. É o Forecast quem muda o
-- status, então o gatilho grava sozinho; reabrir apaga, fechar de novo regrava.
ALTER TABLE forecast_core ADD COLUMN IF NOT EXISTS finished_on date;

CREATE OR REPLACE FUNCTION forecast_core_finished_on() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'closed' THEN
      NEW.finished_on := (now() AT TIME ZONE 'America/New_York')::date;
    ELSE
      NEW.finished_on := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forecast_core_finished_on ON forecast_core;
CREATE TRIGGER forecast_core_finished_on
  BEFORE UPDATE OF status ON forecast_core
  FOR EACH ROW EXECUTE FUNCTION forecast_core_finished_on();

-- Grupo de meta: um ou mais job sites que dividem a meta (Walpole é Station
-- Walk mais Station Walk Towns). Job site fora de grupo não entra na página.
CREATE TABLE IF NOT EXISTS me_goal_groups (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS me_goal_group_sites (
  group_id uuid NOT NULL REFERENCES me_goal_groups(id) ON DELETE CASCADE,
  cliente  text NOT NULL,
  job_site text NOT NULL,
  PRIMARY KEY (cliente, job_site)
);

-- Checkpoint: "a partir deste mês, a meta é X". O mês usa o último checkpoint
-- até ele, então mudar a meta nunca reescreve o passado.
CREATE TABLE IF NOT EXISTS me_goal_checkpoints (
  group_id        uuid NOT NULL REFERENCES me_goal_groups(id) ON DELETE CASCADE,
  effective_year  int  NOT NULL,
  effective_month int  NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
  goal            int  NOT NULL CHECK (goal >= 0),
  PRIMARY KEY (group_id, effective_year, effective_month)
);

CREATE TABLE IF NOT EXISTS me_points (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ref_year    int         NOT NULL,
  ref_month   int         NOT NULL CHECK (ref_month BETWEEN 1 AND 12),
  body        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  group_ids   uuid[]      NOT NULL DEFAULT '{}',
  author_id   text        NOT NULL DEFAULT '',
  author_name text        NOT NULL DEFAULT '',
  author_role text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS me_points_period ON me_points (ref_year, ref_month);

CREATE TABLE IF NOT EXISTS me_point_replies (
  id          bigserial   PRIMARY KEY,
  point_id    uuid        NOT NULL REFERENCES me_points(id) ON DELETE CASCADE,
  body        text        NOT NULL,
  author_id   text        NOT NULL DEFAULT '',
  author_name text        NOT NULL DEFAULT '',
  author_role text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Primeiro checkpoint (folha do Vitor, 04/11/2026), valendo desde janeiro de 2026.
WITH g(name, goal, sites) AS (VALUES
  ('Wheelock Farm',  1, ARRAY['Pulte Homes|Wheelock Farm at Norton, MA']),
  ('Riverview',      2, ARRAY['Pulte Homes|Riverview at East Point, East Providence, RI']),
  ('Bates Quarry',   3, ARRAY['Pulte Homes|Bates Quarry at Walpole, MA']),
  ('Emerald Run',    3, ARRAY['Pulte Homes|Emerald Run at Shrewsbury, MA']),
  ('Broadleaf',      2, ARRAY['Toll Brothers|Broadleaf at Plymouth, MA']),
  ('Owls Nest',      2, ARRAY['Toll Brothers|The Pinehills Owls Nest at Plymouth, MA']),
  ('Newbury Glen',   1, ARRAY['Toll Brothers|Newbury Glen at Hopkinton, MA']),
  ('Walpole',        1, ARRAY['Toll Brothers|Station Walk at Walpole, MA', 'Toll Brothers|Station Walk Towns at Walpole, MA']),
  ('Willis Brook',   3, ARRAY['Toll Brothers|Willis Brook at Lynnfield, MA'])
), ins AS (
  INSERT INTO me_goal_groups (name)
  SELECT name FROM g WHERE NOT EXISTS (SELECT 1 FROM me_goal_groups)
  RETURNING id, name
), sites AS (
  INSERT INTO me_goal_group_sites (group_id, cliente, job_site)
  SELECT ins.id, split_part(s, '|', 1), split_part(s, '|', 2)
  FROM ins JOIN g USING (name), unnest(g.sites) s
)
INSERT INTO me_goal_checkpoints (group_id, effective_year, effective_month, goal)
SELECT ins.id, 2026, 1, g.goal FROM ins JOIN g USING (name);
