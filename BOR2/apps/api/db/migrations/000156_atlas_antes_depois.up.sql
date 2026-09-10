-- Ponto aberto com foto não fecha sem foto do depois.
--
-- Num punch list a imagem não é enfeite, é a prova. Quem fotografa a viga fora
-- de esquadro está afirmando que o problema existe; marcar aquilo como concluído
-- sem uma segunda imagem é afirmar que foi corrigido e não provar nada. O par
-- antes/depois é o que faz o relatório valer alguma coisa para quem não estava
-- lá, e é o que o cliente cobra quando pergunta o que foi feito.
--
-- A regra é condicional de propósito: **só vale para ponto que nasceu com
-- imagem.** Ponto anotado sem foto, que é o caso de uma observação de texto,
-- continua fechando por decisão de quem tem permissão. Exigir foto onde nunca
-- houve foto travaria o fechamento de ponto que ninguém pretendia fotografar.

-- Em que momento do ciclo a imagem entrou.
--
-- Não dá para inferir isso da hora do upload. Uma foto anexada depois pode ser a
-- do problema, tirada no dia seguinte porque a primeira ficou tremida, e uma
-- anexada no mesmo minuto pode já ser a da correção num conserto imediato. Quem
-- sabe é quem anexa, e por isso é declarado.
ALTER TABLE atlas_media
    ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'before'
    CHECK (phase IN ('before', 'after'));

-- O acervo existente é tudo 'before': são fotos de problema, tiradas quando o
-- ponto foi levantado, e nenhuma delas foi anexada como prova de correção
-- porque a distinção não existia.
UPDATE atlas_media SET phase = 'before' WHERE phase IS NULL;

-- A trava mora no banco, e não no handler, porque há três caminhos que fecham um
-- ponto: a tela, a fila de campo e qualquer script futuro. Regra de negócio
-- guardada em um deles é regra que os outros dois furam sem querer.
CREATE OR REPLACE FUNCTION atlas_exige_depois() RETURNS TRIGGER AS $$
DECLARE
    tem_antes  BOOLEAN;
    tem_depois BOOLEAN;
BEGIN
    -- Só interessa a transição para concluído. Reabrir, editar título, mudar
    -- qualquer outra coisa passa direto.
    IF NEW.status <> 'resolved' OR OLD.status = 'resolved' THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (SELECT 1 FROM atlas_media
                    WHERE event_id = NEW.id AND phase = 'before'
                      AND status = 'uploaded' AND content_type LIKE 'image/%')
      INTO tem_antes;

    IF NOT tem_antes THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (SELECT 1 FROM atlas_media
                    WHERE event_id = NEW.id AND phase = 'after'
                      AND status = 'uploaded' AND content_type LIKE 'image/%')
      INTO tem_depois;

    IF NOT tem_depois THEN
        RAISE EXCEPTION 'ponto % foi registrado com foto e precisa de uma foto do depois para ser concluído', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_exige_depois_trg ON atlas_event;
CREATE TRIGGER atlas_exige_depois_trg
    BEFORE UPDATE ON atlas_event
    FOR EACH ROW EXECUTE FUNCTION atlas_exige_depois();

COMMENT ON COLUMN atlas_media.phase IS
    'before = a foto do problema; after = a prova da correção. Ponto com foto '
    'do antes não pode ser concluído sem uma do depois.';
