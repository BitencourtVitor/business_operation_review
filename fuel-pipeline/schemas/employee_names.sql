-- Tabela de normalização de nomes de funcionários
CREATE TABLE IF NOT EXISTS employee_names (
    id BIGSERIAL PRIMARY KEY,
    wex_name TEXT UNIQUE,
    samsara_name TEXT UNIQUE,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_employee_names_wex_name ON employee_names(wex_name);
CREATE INDEX IF NOT EXISTS idx_employee_names_samsara_name ON employee_names(samsara_name);
CREATE INDEX IF NOT EXISTS idx_employee_names_normalized_name ON employee_names(normalized_name);

-- Comentários para documentação
COMMENT ON TABLE employee_names IS 'Tabela de normalização de nomes entre WEX e Samsara';
COMMENT ON COLUMN employee_names.wex_name IS 'Nome como aparece nas transações WEX';
COMMENT ON COLUMN employee_names.samsara_name IS 'Nome como aparece nos eventos Samsara';
COMMENT ON COLUMN employee_names.normalized_name IS 'Nome padronizado para uso interno';

-- Dados iniciais baseados na análise
INSERT INTO employee_names (wex_name, samsara_name, normalized_name) VALUES
    ('JOSE HONORIO', 'Jose Honorio', 'Jose Honorio'),
    ('RODRIGO ROMAO', 'Rodrigo Romao', 'Rodrigo Romao'),
    ('KEVIN SANTOS', 'Kevin', 'Kevin Santos'),
    ('JUAN MENDEZ', 'Juan', 'Juan Mendez'),
    ('EWERTON OLIVEIRA', 'Ewerton', 'Ewerton Oliveira'),
    ('LEANDRO NASCIMENTO', 'Leandro Alves', 'Leandro Nascimento'),
    ('JOSE HELIO VIANA', NULL, 'Jose Helio Viana'),
    ('JOSE QUINO', NULL, 'Jose Quino'),
    ('JOSIMAR D SANTOS', NULL, 'Josimar D Santos'),
    ('ANDRE DA SILVA', NULL, 'Andre Da Silva'),
    ('CLAYTON DE SOUZA', NULL, 'Clayton De Souza'),
    ('EDWIN GONZALEZ', NULL, 'Edwin Gonzalez'),
    ('GILLIANO BORGES', NULL, 'Gilliano Borges'),
    ('GILMAR MACEDO', NULL, 'Gilmar Macedo'),
    ('GUILHERME COSTA', NULL, 'Guilherme Costa'),
    ('JONAS DA SILVA', NULL, 'Jonas Da Silva'),
    ('LEANDRO DA SILVA', NULL, 'Leandro Da Silva'),
    ('LEVI GUSTAVO NASC', NULL, 'Levi Gustavo Nascimento'),
    ('RODRIGO MACEDO', NULL, 'Rodrigo Macedo'),
    ('SIRLEI SANTOS', NULL, 'Sirlei Santos'),
    ('WARLEY OLIVEIRA', NULL, 'Warley Oliveira'),
    ('WIRLLA LEITE', NULL, 'Wirlla Leite'),
    ('Jimmy', NULL, 'Jimmy'),
    ('Pacifico', NULL, 'Pacifico'),
    ('Solon', NULL, 'Solon')
ON CONFLICT (wex_name) DO UPDATE SET
    samsara_name = EXCLUDED.samsara_name,
    normalized_name = EXCLUDED.normalized_name,
    updated_at = NOW();

-- Inserir nomes apenas do Samsara (que não têm correspondência no WEX)
INSERT INTO employee_names (wex_name, samsara_name, normalized_name) VALUES
    (NULL, 'Jimmy', 'Jimmy'),
    (NULL, 'Pacifico', 'Pacifico'),
    (NULL, 'Solon', 'Solon')
ON CONFLICT (samsara_name) DO NOTHING;
