-- Um número de ordem por versão, que é o que o offline compara.
--
-- `atlas_document_version.revision` é texto porque a revisão é o que a obra
-- escreve no carimbo: "2", "rev 2", "REV.2", "C". Isso é identificação para
-- gente, e está certo que seja texto.
--
-- O que ela não pode ser é comparador. A detecção de revisão nova roda em todo
-- evento `online` e em todo retorno do app ao primeiro plano, e precisa
-- responder "o que o aparelho tem é mais velho do que o que existe" com uma
-- comparação barata e sem ambiguidade. Sobre texto isso não existe: 'REV.10'
-- vem antes de 'REV.2' em ordem alfabética, e 'C' não se compara com '2' de
-- jeito nenhum.
--
-- Daí a coluna separada. `seq` não é para ninguém ler: é a ordem em que as
-- versões daquele documento entraram, e serve de carimbo de atualidade. Quem
-- lê continua lendo `revision`.
ALTER TABLE atlas_document_version
    ADD COLUMN IF NOT EXISTS seq INTEGER NOT NULL DEFAULT 0;

-- O acervo existente ganha a ordem que já tinha: a de chegada. `uploaded_at` é
-- o momento em que a versão entrou, e é a ordem real em que as revisões se
-- sucederam.
WITH ordenadas AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY uploaded_at, id) AS n
      FROM atlas_document_version
)
UPDATE atlas_document_version v
   SET seq = o.n
  FROM ordenadas o
 WHERE o.id = v.id AND v.seq = 0;

-- Duas versões do mesmo documento não podem dividir a mesma posição, senão o
-- comparador volta a ser ambíguo pela outra ponta.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_document_version_seq_idx
    ON atlas_document_version (document_id, seq);

-- E o número nasce sozinho, em vez de depender de cada caminho de escrita
-- lembrar de calculá-lo. Versão criada por rota, por script de importação ou à
-- mão no banco recebe a próxima posição do mesmo jeito.
CREATE OR REPLACE FUNCTION atlas_version_seq() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.seq IS NULL OR NEW.seq = 0 THEN
        SELECT COALESCE(MAX(seq), 0) + 1 INTO NEW.seq
          FROM atlas_document_version
         WHERE document_id = NEW.document_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_version_seq_trg ON atlas_document_version;
CREATE TRIGGER atlas_version_seq_trg
    BEFORE INSERT ON atlas_document_version
    FOR EACH ROW EXECUTE FUNCTION atlas_version_seq();

COMMENT ON COLUMN atlas_document_version.seq IS
    'Ordem de chegada da versão dentro do documento. Comparador de atualidade '
    'do offline; não é a revisão que a obra escreve, que é a coluna revision.';
