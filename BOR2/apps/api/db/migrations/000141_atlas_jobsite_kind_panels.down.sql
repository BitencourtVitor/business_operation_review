-- Volta a recusar painel. Obra desse tipo precisa sair antes, ou o CHECK falha.
ALTER TABLE atlas_jobsite DROP CONSTRAINT IF EXISTS atlas_jobsite_kind_check;
ALTER TABLE atlas_jobsite ADD CONSTRAINT atlas_jobsite_kind_check
  CHECK (kind = ANY (ARRAY['lot', 'building', 'house', 'other']));
