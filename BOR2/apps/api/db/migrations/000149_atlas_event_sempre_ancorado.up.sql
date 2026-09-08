-- Task e note passam a ser inseparáveis.
--
-- Eram a mesma linha vista de dois lugares: na prancha um pino num ponto do
-- desenho, em Tasks uma linha da lista. Mas o esquema permitia que uma
-- existisse sem a outra, e o sistema usava essa brecha de propósito: a borracha
-- do leitor mandava `detach`, que zerava a folha e as coordenadas e deixava o
-- evento de pé.
--
-- A ideia era preservar o que já tinha sido respondido. Na prática produzia o
-- pior resultado possível: uma task que ninguém mais conseguia localizar no
-- desenho, porque a marca que dizia onde ela ficava era justamente a que tinha
-- sido apagada. Cinco delas se acumularam assim.
--
-- Três mudanças, e as três dizem a mesma coisa por caminhos diferentes.

-- 1. O resíduo sai. Não há como devolver a âncora a nenhuma: o ponto onde elas
--    ficavam foi zerado quando o pino foi solto, e não está guardado em lugar
--    nenhum. Sobra apagar.
DELETE FROM atlas_event WHERE sheet_id IS NULL;

-- 2. Apagar a folha passa a apagar o que foi anotado sobre ela, em vez de
--    soltar a anotação no vazio. `SET NULL` era a mesma brecha do `detach`,
--    só que acionada pelo banco: bastava uma versão ser removida para nascerem
--    tasks órfãs sem ninguém ter pedido nada.
ALTER TABLE atlas_event DROP CONSTRAINT IF EXISTS atlas_event_sheet_id_fkey;
ALTER TABLE atlas_event
    ADD CONSTRAINT atlas_event_sheet_id_fkey
    FOREIGN KEY (sheet_id) REFERENCES atlas_sheet(id) ON DELETE CASCADE;

-- 3. E a regra vira estrutura, não disciplina de quem escreve o código. Enquanto
--    a coluna aceitar nulo, basta um caminho novo esquecer de preencher a folha
--    para o resíduo voltar a nascer.
ALTER TABLE atlas_event ALTER COLUMN sheet_id SET NOT NULL;
