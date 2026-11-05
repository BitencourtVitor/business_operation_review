CREATE TABLE IF NOT EXISTS wp_overtime_notes (
  company    text        NOT NULL,
  employee   text        NOT NULL,
  week_start date        NOT NULL,
  note       text        NOT NULL,
  author     text        NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company, employee, week_start)
);

COMMENT ON TABLE wp_overtime_notes IS 'Workforce Productivity (WF-16): o que aconteceu numa semana com overtime de uma pessoa. week_start é a segunda-feira da semana, como no corte das 40 h.';
