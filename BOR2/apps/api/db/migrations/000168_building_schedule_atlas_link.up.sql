-- O cronograma do Building Schedule passa a apontar para o projeto do Atlas que
-- ele descreve. Um para um: o cronograma é de um prédio, e o projeto do Atlas
-- também é um building ou lot. Apagar o projeto solta o vínculo, não o
-- cronograma.
ALTER TABLE construction_buildings
  ADD COLUMN IF NOT EXISTS atlas_jobsite_id TEXT
    REFERENCES atlas_jobsite(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_construction_buildings_atlas_jobsite
  ON construction_buildings(atlas_jobsite_id)
  WHERE atlas_jobsite_id IS NOT NULL;
