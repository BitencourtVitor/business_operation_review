-- Categoria padrão contra categoria sugerida.
--
-- A taxonomia cresce com o trabalho: aparece um prédio com uma categoria que
-- ninguém tinha previsto, e quem está anexando o documento cria a categoria ali
-- mesmo. Só que isso não pode despejar a pasta nova em todas as obras — o que
-- aquele prédio tem não é o que os outros têm.
--
-- Daí a distinção: `default_slot` verdadeiro é a categoria que toda obra do
-- tipo recebe ao nascer; falso é a que fica guardada como sugestão, disponível
-- para ser acrescentada a qualquer obra depois — inclusive às já cadastradas.
ALTER TABLE atlas_doc_category
    ADD COLUMN IF NOT EXISTS default_slot BOOLEAN NOT NULL DEFAULT true;

-- As 12 categorias iniciais vieram das pastas reais e valem como padrão.
UPDATE atlas_doc_category SET default_slot = true WHERE default_slot IS NULL;
