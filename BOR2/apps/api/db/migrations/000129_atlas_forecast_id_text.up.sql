-- `forecast_core.id` é TEXT, não número.
--
-- A 000128 criou o vínculo como BIGINT porque eu olhei a coluna pelo nome e não
-- pelo tipo. Os ids reais são mistos — "9ec79921" ao lado de
-- "082beb74-9781-4ffc-9b5c-7f00a9ab721a" —, então qualquer importação teria
-- falhado na primeira obra.
ALTER TABLE atlas_jobsite
    ALTER COLUMN forecast_id TYPE TEXT USING forecast_id::text;
