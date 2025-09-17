-- Inserir a tela Forecast na tabela telas
INSERT INTO telas (id, titulo, descricao) 
VALUES (
  gen_random_uuid(),
  'Forecast',
  'Forecast'
);

-- Verificar se foi inserida corretamente
SELECT id, titulo, descricao FROM telas WHERE descricao = 'Forecast';
