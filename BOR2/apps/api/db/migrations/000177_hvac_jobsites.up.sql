-- Jobsite da HVAC editável no Schedule and Material (HS-23).
--
-- source_name guarda o nome que vem do SupplyPro depois que o jobsite é
-- renomeado na tela: a rotina de atualização traduz por ele, senão a rodada
-- seguinte recriaria o nome antigo.
-- responsibles é anotação: os nomes de quem responde pelo jobsite, sem vínculo
-- com usuário do sistema.
-- hvac marca o jobsite criado ou editado pela tela da HVAC, para ele aparecer
-- lá mesmo sem obra; o catálogo é compartilhado com a Framing.
ALTER TABLE catalog_job_sites
  ADD COLUMN IF NOT EXISTS source_name  TEXT,
  ADD COLUMN IF NOT EXISTS responsibles TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hvac         BOOLEAN NOT NULL DEFAULT false;
