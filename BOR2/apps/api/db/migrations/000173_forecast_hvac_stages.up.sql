-- O que a obra de fato fez, ao lado do que estava planejado.
--
-- Até aqui `forecast_core` só guardava a data **planejada** de cada etapa, a que
-- vem das Orders. Sem a data real não existe atraso: toda etapa planejada no
-- passado parecia terminada, e "atrasado para começar" não tinha como ser
-- calculado.
--
-- Tabela e não mais oito colunas em `forecast_core`, que já carrega oito de
-- etapa: aqui cada etapa é uma linha, e o que vier depois (pedido de material,
-- quem confirmou, observação da etapa) pendura como coluna desta tabela, sem
-- alargar a do forecast a cada item novo.
--
-- A divisão de donos também fica limpa: o planejado é escrito pela rotina de
-- atualização do forecast, que vive fora deste repo; o real é escrito por quem
-- usa o BOR. Cada um na sua tabela.
CREATE TABLE IF NOT EXISTS forecast_hvac_stages (
    project_id   TEXT        NOT NULL REFERENCES forecast_core(id) ON DELETE CASCADE,
    -- As quatro visitas do ciclo, na ordem em que acontecem na obra.
    stage        TEXT        NOT NULL CHECK (stage IN ('rough', 'air_handler', 'condenser', 'finish')),
    actual_start DATE,
    actual_end   DATE,
    -- Terminar sem ter começado não é estado possível em obra.
    CONSTRAINT forecast_hvac_stages_ordem CHECK (
        actual_end IS NULL OR actual_start IS NOT NULL
    ),
    CONSTRAINT forecast_hvac_stages_intervalo CHECK (
        actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start
    ),
    note         TEXT        NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   TEXT        NOT NULL DEFAULT '',
    PRIMARY KEY (project_id, stage)
);

-- A tela lê todas as etapas reais da HVAC de uma vez, para cruzar com a lista
-- de obras que já tem em mãos.
CREATE INDEX IF NOT EXISTS forecast_hvac_stages_project_idx
    ON forecast_hvac_stages (project_id);
