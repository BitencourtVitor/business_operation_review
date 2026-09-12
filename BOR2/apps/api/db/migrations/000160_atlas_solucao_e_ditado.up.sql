-- A mídia ganha nome, descrição e transcrição.
--
-- Três demandas diferentes que caem na mesma tabela.
--
-- **A solução se documenta.** Um ponto fecha com uma ou mais imagens ou vídeos
-- do que foi feito, e cada um precisa dizer o que mostra. `caption` já existia e
-- não serve: é a legenda de uma foto de álbum, uma linha só, sem título. Quem
-- documenta um conserto escreve um título curto e um parágrafo, e são coisas
-- distintas na hora de imprimir o relatório.
--
-- **O vídeo passa a valer como prova.** A trava da migração 000156 exige imagem
-- do depois para fechar ponto que nasceu com imagem, e contava só
-- `content_type LIKE 'image/%'`. Vídeo de trinta segundos mostrando a viga
-- refeita é prova melhor que foto, e era recusado.
--
-- **O áudio vira texto.** A descrição do problema é falada em obra, porque
-- ninguém digita parágrafo de luva. O arquivo fica guardado, e a transcrição
-- fica ao lado dele: transcrição sem o áudio original não tem como ser
-- conferida quando sai errada, e ela sai errada em canteiro barulhento.

ALTER TABLE atlas_media
    ADD COLUMN IF NOT EXISTS title       TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS transcript  TEXT NOT NULL DEFAULT '';

-- A prova do antes e a do depois passam a aceitar vídeo.
--
-- O resto da regra continua igual: só vale para ponto que nasceu com registro
-- visual, e ponto de texto puro continua fechando por decisão de quem tem
-- permissão.
CREATE OR REPLACE FUNCTION atlas_exige_depois() RETURNS TRIGGER AS $$
DECLARE
    tem_antes  BOOLEAN;
    tem_depois BOOLEAN;
BEGIN
    IF NEW.status <> 'resolved' OR OLD.status = 'resolved' THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (SELECT 1 FROM atlas_media
                    WHERE event_id = NEW.id AND phase = 'before'
                      AND status = 'uploaded'
                      AND (content_type LIKE 'image/%' OR content_type LIKE 'video/%'))
      INTO tem_antes;

    IF NOT tem_antes THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (SELECT 1 FROM atlas_media
                    WHERE event_id = NEW.id AND phase = 'after'
                      AND status = 'uploaded'
                      AND (content_type LIKE 'image/%' OR content_type LIKE 'video/%'))
      INTO tem_depois;

    IF NOT tem_depois THEN
        RAISE EXCEPTION 'ponto % foi registrado com imagem e precisa de um registro do depois para ser concluído', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN atlas_media.title IS
    'O título do registro. Na solução de um ponto é o que foi feito, em uma linha.';
COMMENT ON COLUMN atlas_media.transcript IS
    'O texto da descrição falada, quando esta mídia é áudio. O arquivo original '
    'fica guardado ao lado para a transcrição poder ser conferida.';
