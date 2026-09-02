-- Nem todo evento importado sabe o dia em que aconteceu. A coluna `at` continua
-- obrigatória — é ela que ordena a linha do tempo, os limites de data entre
-- eventos e os documentos —, e esta marca diz que aquele dia é o do registro,
-- não um fato que alguém afirmou.
ALTER TABLE pcg_trade_events
  ADD COLUMN IF NOT EXISTS at_unknown BOOLEAN NOT NULL DEFAULT false;
