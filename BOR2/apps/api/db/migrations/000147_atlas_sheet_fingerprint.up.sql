-- A impressão digital da página, para o Atlas saber quando duas folhas são a
-- mesma coisa (AT-51/AT-52 do backlog de 04/09).
--
-- Gestão documental parte de uma expectativa: cada pasta tem um arquivo, e
-- dentro dele páginas que não se repetem. A expectativa não se sustenta
-- sozinha. O projetista reexporta o set inteiro por causa de três pranchas, a
-- mesma prancha volta com dois nomes, o gabarito lê a mesma identificação em
-- duas folhas diferentes. Sem um jeito de comparar conteúdo, o sistema só sabe
-- comparar nome, e nome é justamente o que bagunça.
--
-- Duas colunas e não uma porque pegam coisas diferentes:
--
--   text_hash — o texto da página, na ordem em que o PDF guarda os trechos.
--               Cota corrigida, nota do projetista, código de peça trocado.
--   geom_hash — a lista de operadores de desenho, com os argumentos numéricos
--               arredondados a 0,1 pt. Parede que andou, painel que mudou de
--               vão, corte redesenhado: pode não mexer em texto nenhum.
--
-- Hash de bytes não serve, e é o que parecia óbvio. A folha publicada não é a
-- página do PDF original, é um recorte que o pdf-lib gerou, e nunca bateria
-- byte a byte com a origem. Pior: reexportar a mesma prancha sem mudar nada já
-- produz bytes diferentes, por causa de data de criação e ordem do xref, o que
-- acusaria o set inteiro como alterado em todo reenvio.
--
-- Medido em 04/09 sobre um set real de 97 páginas: os dois hashes das 97 saem
-- em 2,3 s, sem colisão entre páginas, e sobrevivem intactos ao recorte do
-- pdf-lib. É essa última parte que torna a comparação possível.

ALTER TABLE atlas_sheet
    ADD COLUMN IF NOT EXISTS text_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS geom_hash TEXT NOT NULL DEFAULT '';

-- Achar a folha gêmea é a pergunta quente: dado o par de hashes de uma página
-- que está entrando, existe alguma folha em vigor neste documento com o mesmo
-- conteúdo? Sem índice isso varre todas as folhas da obra a cada página.
CREATE INDEX IF NOT EXISTS atlas_sheet_fingerprint
    ON atlas_sheet (version_id, text_hash, geom_hash)
    WHERE superseded_at IS NULL AND text_hash <> '';
