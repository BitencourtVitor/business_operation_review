-- Expand users table with BOR1 fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS financial_pass BOOLEAN NOT NULL DEFAULT FALSE;

-- Screens/pages permission system
CREATE TABLE telas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-screen permissions (many-to-many)
CREATE TABLE usuarios_telas (
  usuario_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tela_id    UUID NOT NULL REFERENCES telas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, tela_id)
);

CREATE INDEX idx_usuarios_telas_usuario ON usuarios_telas(usuario_id);
CREATE INDEX idx_usuarios_telas_tela ON usuarios_telas(tela_id);

-- Expand user_role enum with BOR1 roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dev';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gestor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin_setor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';
