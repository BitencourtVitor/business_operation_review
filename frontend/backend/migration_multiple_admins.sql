-- Migração para suportar múltiplos administradores por tela
-- Este arquivo demonstra as mudanças necessárias no banco de dados

-- 1. Verificar a estrutura atual da tabela usuarios_telas
-- A tabela já suporta múltiplos registros por tela, mas vamos otimizar

-- 2. Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_usuarios_telas_tela_id ON usuarios_telas(tela_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_telas_usuario_id ON usuarios_telas(usuario_id);

-- 3. Adicionar constraint para evitar duplicatas (opcional)
-- ALTER TABLE usuarios_telas ADD CONSTRAINT unique_usuario_tela UNIQUE (usuario_id, tela_id);

-- 4. Exemplo de inserção de múltiplos administradores para uma tela
-- INSERT INTO usuarios_telas (usuario_id, tela_id) VALUES 
--   ('uuid-do-usuario-1', 'uuid-da-tela'),
--   ('uuid-do-usuario-2', 'uuid-da-tela'),
--   ('uuid-do-usuario-3', 'uuid-da-tela');

-- 5. Exemplo de consulta para buscar todos os administradores de uma tela
-- SELECT u.nome_completo, u.email, ut.tela_id
-- FROM usuarios_telas ut
-- JOIN usuarios u ON ut.usuario_id = u.id
-- WHERE ut.tela_id = 'uuid-da-tela';

-- 6. Exemplo de consulta para verificar se um usuário é administrador de uma tela
-- SELECT COUNT(*) > 0 as is_admin
-- FROM usuarios_telas
-- WHERE usuario_id = 'uuid-do-usuario' AND tela_id = 'uuid-da-tela';

-- 7. Exemplo de remoção de um administrador específico
-- DELETE FROM usuarios_telas 
-- WHERE usuario_id = 'uuid-do-usuario' AND tela_id = 'uuid-da-tela';

-- 8. Exemplo de atualização de administradores (substituir todos)
-- DELETE FROM usuarios_telas WHERE tela_id = 'uuid-da-tela';
-- INSERT INTO usuarios_telas (usuario_id, tela_id) VALUES 
--   ('novo-usuario-1', 'uuid-da-tela'),
--   ('novo-usuario-2', 'uuid-da-tela');

-- Nota: A estrutura atual da tabela usuarios_telas já suporta múltiplos administradores
-- As mudanças no código TypeScript/React são suficientes para implementar a funcionalidade
