-- Destaques (highlights) per user per screen per month
CREATE TABLE destaques (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tela_id    UUID NOT NULL REFERENCES telas(id) ON DELETE CASCADE,
  mes        INTEGER NOT NULL,
  ano        INTEGER NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_destaques_usuario ON destaques(usuario_id);
CREATE INDEX idx_destaques_tela ON destaques(tela_id);
CREATE INDEX idx_destaques_period ON destaques(ano, mes);

CREATE TABLE destaques_positivos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destaque_id UUID NOT NULL REFERENCES destaques(id) ON DELETE CASCADE,
  texto       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_destaques_pos_destaque ON destaques_positivos(destaque_id);

CREATE TABLE destaques_negativos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destaque_id UUID NOT NULL REFERENCES destaques(id) ON DELETE CASCADE,
  texto       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_destaques_neg_destaque ON destaques_negativos(destaque_id);

-- Oportunidades (opportunities) per user per screen per month
CREATE TABLE oportunidades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tela_id    UUID NOT NULL REFERENCES telas(id) ON DELETE CASCADE,
  mes        INTEGER NOT NULL,
  ano        INTEGER NOT NULL,
  titulo     TEXT NOT NULL DEFAULT '',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_oportunidades_usuario ON oportunidades(usuario_id);
CREATE INDEX idx_oportunidades_tela ON oportunidades(tela_id);

CREATE TABLE desafios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  texto           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_desafios_oportunidade ON desafios(oportunidade_id);

CREATE TABLE melhorias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  texto           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_melhorias_oportunidade ON melhorias(oportunidade_id);

-- Planos de ação (action plans) per user per screen
CREATE TABLE planos_de_acao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tela_id     UUID NOT NULL REFERENCES telas(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL DEFAULT '',
  descricao   TEXT NOT NULL DEFAULT '',
  data_inicio DATE,
  data_fim    DATE,
  status      TEXT NOT NULL DEFAULT 'pendente',
  deletado    BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_planos_usuario ON planos_de_acao(usuario_id);
CREATE INDEX idx_planos_tela ON planos_de_acao(tela_id);
CREATE INDEX idx_planos_status ON planos_de_acao(status);

-- Ações (actions within plans)
CREATE TABLE acoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id    UUID NOT NULL REFERENCES planos_de_acao(id) ON DELETE CASCADE,
  titulo      TEXT NOT NULL DEFAULT '',
  responsavel TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pendente',
  data_limite DATE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_acoes_plano ON acoes(plano_id);

-- Expand receivables/payables into separate tables matching BOR1
CREATE TABLE receivables_accounting (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id              TEXT UNIQUE,
  date_field             DATE,
  inv_date               DATE,
  transaction_type       TEXT NOT NULL DEFAULT '',
  inv_num                TEXT NOT NULL DEFAULT '',
  customer_full_name     TEXT NOT NULL DEFAULT '',
  due_date               DATE,
  open_balance           NUMERIC(15,2) NOT NULL DEFAULT 0,
  category               TEXT NOT NULL DEFAULT '',
  aging_intervals        TEXT NOT NULL DEFAULT '',
  last_update_datetimez  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_receivables_customer ON receivables_accounting(customer_full_name);
CREATE INDEX idx_receivables_date ON receivables_accounting(date_field);

CREATE TABLE payables_accounting (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intern_id              TEXT UNIQUE,
  date_field             DATE,
  expense_date           DATE,
  transaction_type       TEXT NOT NULL DEFAULT '',
  bill_num               TEXT NOT NULL DEFAULT '',
  vendor_display_name    TEXT NOT NULL DEFAULT '',
  due_date               DATE,
  open_balance           NUMERIC(15,2) NOT NULL DEFAULT 0,
  category               TEXT NOT NULL DEFAULT '',
  aging_intervals        TEXT NOT NULL DEFAULT '',
  last_update_datetimez  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payables_vendor ON payables_accounting(vendor_display_name);
CREATE INDEX idx_payables_date ON payables_accounting(date_field);
