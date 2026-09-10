-- A fila de campo, e o log de eventos que ela alimenta.
--
-- Hoje o cliente manda estado final: cria o ponto, e depois manda o ponto com a
-- condição nova. Isso funciona enquanto há rede. Sem rede não funciona de jeito
-- nenhum, porque estado final não se acumula: se a pessoa cria o ponto, comenta
-- duas vezes e fecha, tudo isso offline, o que sobe depois é só o último estado,
-- e os três passos do meio nunca existiram para o sistema.
--
-- Aqui o cliente passa a mandar **eventos carimbados no tempo**. O servidor
-- ordena e aplica em cascata. O estado atual de um ponto deixa de ser um campo
-- e passa a ser o resultado da reprodução dos eventos na ordem certa, o que
-- entrega de graça a linha do tempo e a rastreabilidade que uma verificação de
-- obra exige.
--
-- O ambiente é single-tenant e edição simultânea do mesmo ponto não é esperada,
-- então isto **não precisa nascer sofisticado**. Precisa nascer com o registro
-- do evento, que é o que permite reconstruir depois. A projeção continua sendo
-- `atlas_event`, que já existe e continua sendo consultada direto pelas telas.

CREATE TABLE IF NOT EXISTS atlas_sync_event (
    -- O id nasce no cliente. É o que torna o envio idempotente: a pessoa sobe a
    -- fila, o sinal cai antes da resposta chegar, o cliente reenvia, e o
    -- servidor reconhece o que já aplicou em vez de duplicar.
    id           TEXT PRIMARY KEY,

    user_id      TEXT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    jobsite_id   TEXT NOT NULL REFERENCES atlas_jobsite(id) ON DELETE CASCADE,

    -- O que aconteceu, e sobre o quê. `target_id` é o id do ponto, que também
    -- nasce no cliente: sem isso um comentário criado offline não teria a quem
    -- se referir antes de o ponto subir.
    kind         TEXT NOT NULL CHECK (kind IN (
                    'point.created', 'point.commented',
                    'point.status_changed', 'point.photo_attached',
                    'point.deleted')),
    target_id    TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- De qual aparelho veio, e em que posição da fila dele.
    --
    -- A dupla existe porque relógio de tablet em campo não é confiável. Ordenar
    -- só por `occurred_at` inverteria eventos de um aparelho com a hora errada,
    -- e o comentário apareceria antes do ponto que ele comenta. `device_seq` é
    -- monotônico dentro do aparelho e resolve a ordem local sem depender do
    -- relógio.
    device_id    TEXT NOT NULL DEFAULT '',
    device_seq   BIGINT NOT NULL DEFAULT 0,

    -- Os dois carimbos. `occurred_at` é o momento no aparelho e é o que a linha
    -- do tempo mostra ao usuário, porque é a hora em que a pessoa de fato viu o
    -- problema. `received_at` é a chegada ao servidor e é o que a reconstrução
    -- usa, somado à sequência lógica do aparelho.
    occurred_at  TIMESTAMPTZ NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- O ciclo de vida do evento dentro da fila.
    --
    -- `rejected` não é descarte: o evento fica, com autor, momento, o que a
    -- pessoa pretendia fazer e o porquê da recusa. Comentário em ponto que outro
    -- usuário excluiu, reabertura de ponto já encerrado e exportado. Quem
    -- mandou vê isso na própria fila e decide o que fazer.
    --
    -- `blocked` é o efeito cascata. Falhando a criação de um ponto, os eventos
    -- seguintes dele não são quatro erros independentes: são um só, e os outros
    -- ficam presos apontando para quem os travou. Resolvido o primeiro, os
    -- demais reprocessam na ordem original. O usuário vê um problema, não
    -- quatro.
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'applied', 'rejected', 'blocked')),
    reason       TEXT NOT NULL DEFAULT '',
    blocked_by   TEXT REFERENCES atlas_sync_event(id) ON DELETE SET NULL,
    applied_at   TIMESTAMPTZ,

    -- Coerência entre condição e carimbo, pelo mesmo motivo do resolved_at das
    -- tasks: evento aplicado sem hora de aplicação, ou o contrário, é estado que
    -- nenhuma leitura sabe interpretar.
    CONSTRAINT atlas_sync_event_applied_coerente
        CHECK ((status = 'applied') = (applied_at IS NOT NULL)),
    CONSTRAINT atlas_sync_event_blocked_coerente
        CHECK (status <> 'blocked' OR blocked_by IS NOT NULL)
);

-- A fila de uma pessoa, que é a tela que ela abre para ver o que falta subir.
CREATE INDEX IF NOT EXISTS atlas_sync_event_fila_idx
    ON atlas_sync_event (user_id, status, received_at);

-- Os eventos de um ponto, na ordem de reconstrução. É a consulta da linha do
-- tempo e a da reaplicação em cascata.
CREATE INDEX IF NOT EXISTS atlas_sync_event_alvo_idx
    ON atlas_sync_event (target_id, received_at, device_seq);

-- O indicador por obra, que a lista de projetos mostra.
CREATE INDEX IF NOT EXISTS atlas_sync_event_obra_idx
    ON atlas_sync_event (jobsite_id, status);

-- Uma posição da fila de um aparelho é única. Sem isto, um reenvio com id novo
-- e a mesma posição entraria duas vezes e a ordem deixaria de ser determinística.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_sync_event_device_seq_idx
    ON atlas_sync_event (device_id, device_seq)
    WHERE device_id <> '' AND device_seq > 0;

COMMENT ON TABLE atlas_sync_event IS
    'Log de eventos de campo. Fonte de verdade do que aconteceu; atlas_event é a '
    'projeção consultada pelas telas.';
