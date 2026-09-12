-- A rodada herda o dono de quem levantou o primeiro ponto dela.
--
-- A migração 000159 criou uma passagem por escopo que já tinha ponto, e naquele
-- momento ela não tinha como saber de quem era: o ponto sabia quem o levantou, a
-- rodada ainda não existia. Ficou com o dono vazio, e a tela que mostra quem
-- conduz a verificação aparecia sem nome nenhum.
--
-- O dono certo é quem levantou o primeiro ponto: é quem de fato começou a
-- percorrer aquele escopo. Vale só para rodada sem dono, então rodar de novo não
-- reescreve nada, e ambiente novo que aplique as migrações do zero já nasce com
-- a autoria certa.
UPDATE atlas_punch p
   SET opened_by = COALESCE((
       SELECT e.created_by FROM atlas_event e
        WHERE e.punch_id = p.id AND e.created_by <> ''
        ORDER BY e.created_at
        LIMIT 1
   ), p.opened_by)
 WHERE p.opened_by = '';
