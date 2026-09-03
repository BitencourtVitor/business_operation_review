-- O vínculo entre folhas entra como ferramenta de anotação.
--
-- É o que a prancha já traz impresso e o papel não consegue cumprir: a bolha de
-- referência que diz "veja o detalhe 3 na A-501". No papel a pessoa procura a
-- folha; aqui ela toca e chega. Como marca sobre o desenho, com posição e autor,
-- ele é uma anotação como as outras, e não uma tabela nova: o que muda é o que a
-- geometria carrega, e ela já é jsonb.
ALTER TABLE atlas_annotation DROP CONSTRAINT IF EXISTS atlas_annotation_tool_check;

ALTER TABLE atlas_annotation
  ADD CONSTRAINT atlas_annotation_tool_check
  CHECK (tool = ANY (ARRAY['pen'::text, 'highlighter'::text, 'link'::text]));
