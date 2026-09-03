-- Painel entra na lista de tipos de obra.
--
-- O CHECK nasceu com o Atlas listando lote, prédio, casa e "outro". Painel não
-- é nenhum deles: a Premium fabrica a placa e entrega para a obra de outra
-- empresa, sem levantar nada. Sem esta linha, o cadastro era recusado pelo banco
-- depois de a tela já ter aceitado o tipo.
--
-- "lot" e "other" continuam aceitos porque obra antiga pode carregá-los; o
-- cadastro de hoje só grava building, house ou panels.
ALTER TABLE atlas_jobsite DROP CONSTRAINT IF EXISTS atlas_jobsite_kind_check;
ALTER TABLE atlas_jobsite ADD CONSTRAINT atlas_jobsite_kind_check
  CHECK (kind = ANY (ARRAY['lot', 'building', 'house', 'other', 'panels']));
