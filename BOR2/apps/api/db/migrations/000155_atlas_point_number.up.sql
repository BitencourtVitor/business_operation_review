-- O número do ponto, contínuo por obra, e o fuso de quem o registrou.
--
-- A verificação acontece andar por andar, na ordem em que a obra fica pronta: o
-- primeiro pavimento rende os pontos 1 a 15, o segundo começa no 16 e vai até o
-- 23, e assim por diante. A numeração é da obra inteira e não do andar, e o
-- andar aparece pela faixa que ele ocupou. É como a pessoa que percorre a obra
-- já conta hoje.
--
-- Normalmente há um responsável só, e enquanto for assim não há colisão. A
-- decisão aqui é sobre o caso em que não é: alguém verifica em paralelo, sem
-- sinal, e sincroniza depois de outro já ter ocupado aquele número.
--
-- **Esse ponto é inválido, e não renumerado.** Renumerar em silêncio pareceria
-- gentileza e seria a pior saída: o número está escrito no relatório impresso
-- que a pessoa levou para o canteiro, dito em conversa, anotado no papel. Trocar
-- por baixo faz o sistema e o mundo discordarem sobre qual ponto é o 17, sem
-- ninguém perceber. Recusar é ruidoso, e é exatamente por isso que serve: quem
-- registrou vê a recusa na própria fila, com o motivo, e decide o que fazer.

ALTER TABLE atlas_event
    ADD COLUMN IF NOT EXISTS point_number INTEGER;

-- O acervo existente ganha número pela ordem em que foi criado, que é a ordem em
-- que a obra foi percorrida.
WITH ordenados AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY jobsite_id ORDER BY created_at, id) AS n
      FROM atlas_event
)
UPDATE atlas_event e SET point_number = o.n
  FROM ordenados o
 WHERE o.id = e.id AND e.point_number IS NULL;

-- A trava que torna a colisão detectável em vez de silenciosa. É ela que faz o
-- INSERT do segundo falhar, e é a falha que vira a recusa na fila.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_event_point_number_idx
    ON atlas_event (jobsite_id, point_number)
    WHERE point_number IS NOT NULL;

-- Ponto criado pela tela, com rede, não precisa carregar número: pega o próximo
-- da obra sozinho. Quem manda número é o aparelho offline, que precisou decidir
-- antes de poder perguntar.
CREATE OR REPLACE FUNCTION atlas_point_number() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.point_number IS NULL THEN
        SELECT COALESCE(MAX(point_number), 0) + 1 INTO NEW.point_number
          FROM atlas_event WHERE jobsite_id = NEW.jobsite_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_point_number_trg ON atlas_event;
CREATE TRIGGER atlas_point_number_trg
    BEFORE INSERT ON atlas_event
    FOR EACH ROW EXECUTE FUNCTION atlas_point_number();

-- O fuso de quem registrou.
--
-- `occurred_at` é TIMESTAMPTZ e normaliza tudo para UTC, o que resolve a ordem e
-- perde a única informação que a linha do tempo precisa mostrar: que horas eram
-- **para a pessoa** quando ela viu o problema. Um ponto registrado às 7 da manhã
-- em Massachusetts vira 11 ou 12 UTC, e exibir isso conta uma história errada
-- sobre o turno de trabalho.
--
-- O deslocamento em minutos, e não o nome da zona, porque é o que o aparelho
-- sabe responder sem tabela: `-new Date().getTimezoneOffset()`.
ALTER TABLE atlas_sync_event
    ADD COLUMN IF NOT EXISTS occurred_offset_minutes SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN atlas_event.point_number IS
    'Número do ponto no punch list, contínuo por obra. Colisão na sincronização '
    'invalida o ponto que chegou depois; nunca renumera.';
COMMENT ON COLUMN atlas_sync_event.occurred_offset_minutes IS
    'Fuso do aparelho no momento do registro, em minutos a leste de UTC. '
    'occurred_at guarda o instante; isto guarda que horas eram para a pessoa.';
