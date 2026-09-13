-- A solução passa a morar no ponto.
--
-- Desde a migração 000160 o que foi feito para resolver um ponto era escrito na
-- foto do depois: título na primeira peça, descrição em cada uma. O relato de
-- uma correção virava pedaços espalhados por fotos, o relatório tinha de colar
-- as descrições para remontar o texto, e trocar a foto que abria o conjunto
-- trocava o título da solução.
--
-- O problema sempre morou no ponto (`title` e `body`). A solução passa a morar
-- ao lado dele, com o mesmo formato, e a foto volta a ser só a prova.

ALTER TABLE atlas_event
    ADD COLUMN IF NOT EXISTS solution_title TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS solution_body  TEXT NOT NULL DEFAULT '';

-- O que já foi escrito nas fotos vem junto, na mesma conta que a tela fazia:
-- o título é o da primeira peça do depois que tem título; o corpo junta, na
-- ordem de envio, a descrição dessa peça e "título: descrição" das demais.
WITH pecas AS (
    SELECT m.event_id, m.id, m.title, m.description, m.uploaded_at
      FROM atlas_media m
     WHERE m.phase = 'after' AND m.status = 'uploaded'
       AND (m.content_type LIKE 'image/%' OR m.content_type LIKE 'video/%')
),
titulo AS (
    SELECT DISTINCT ON (event_id) event_id, id, title
      FROM pecas
     WHERE title <> ''
     ORDER BY event_id, uploaded_at
),
solucao AS (
    SELECT p.event_id,
           COALESCE(max(t.title), '') AS titulo,
           COALESCE(string_agg(
               CASE WHEN p.id = t.id THEN NULLIF(p.description, '')
                    ELSE NULLIF(concat_ws(': ', NULLIF(p.title, ''), NULLIF(p.description, '')), '')
               END, E'\n' ORDER BY p.uploaded_at), '') AS corpo
      FROM pecas p
      LEFT JOIN titulo t ON t.event_id = p.event_id
     GROUP BY p.event_id
)
UPDATE atlas_event e
   SET solution_title = s.titulo,
       solution_body  = s.corpo
  FROM solucao s
 WHERE e.id = s.event_id
   AND e.solution_title = '' AND e.solution_body = '';

COMMENT ON COLUMN atlas_event.solution_title IS
    'O que foi feito para resolver o ponto, em uma linha.';
COMMENT ON COLUMN atlas_event.solution_body IS
    'O relato da correção. A prova (foto ou vídeo do depois) fica em atlas_media.';
