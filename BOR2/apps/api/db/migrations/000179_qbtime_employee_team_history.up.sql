-- O time da pessoa muda de uma quinzena para a outra, e qbtime_employee_teams
-- só guarda o de agora: semana passada aparecia com o time de hoje (WH-2).
-- Cada troca do time efetivo (override, senão o do QB Time) vira uma linha aqui
-- com a data em que passou a valer. '' é "sem time".
CREATE TABLE IF NOT EXISTS qbtime_employee_team_history (
    id               BIGSERIAL PRIMARY KEY,
    employee_team_id UUID NOT NULL REFERENCES qbtime_employee_teams(id) ON DELETE CASCADE,
    team_name        TEXT NOT NULL,
    valid_from       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS qbtime_employee_team_history_idx
    ON qbtime_employee_team_history (employee_team_id, valid_from DESC);

-- O histórico começa hoje. O primeiro time conhecido de cada pessoa vale para
-- tudo o que veio antes: é o melhor que se sabe do passado.
INSERT INTO qbtime_employee_team_history (employee_team_id, team_name, valid_from)
SELECT id, COALESCE(NULLIF(override_team_name, ''), NULLIF(qbt_team_name, ''), ''), '-infinity'
  FROM qbtime_employee_teams;

-- No gatilho e não no código: o time efetivo muda por três caminhos (sync
-- diário, aplicar override, tirar override) e nenhum deles pode esquecer.
CREATE OR REPLACE FUNCTION qbtime_employee_team_track() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    novo TEXT := COALESCE(NULLIF(NEW.override_team_name, ''), NULLIF(NEW.qbt_team_name, ''), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO qbtime_employee_team_history (employee_team_id, team_name, valid_from)
        VALUES (NEW.id, novo, '-infinity');
    ELSIF novo <> COALESCE(NULLIF(OLD.override_team_name, ''), NULLIF(OLD.qbt_team_name, ''), '') THEN
        INSERT INTO qbtime_employee_team_history (employee_team_id, team_name, valid_from)
        VALUES (NEW.id, novo, NOW());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qbtime_employee_team_track ON qbtime_employee_teams;
CREATE TRIGGER qbtime_employee_team_track
    AFTER INSERT OR UPDATE ON qbtime_employee_teams
    FOR EACH ROW EXECUTE FUNCTION qbtime_employee_team_track();
