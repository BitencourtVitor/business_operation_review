-- O que o checkbox sabia.
--
-- forecast_core.hvac era marcado à mão e, para a Pulte Homes, é hoje a única
-- fonte que diz que a obra tem HVAC — não existe export do portal da Pulte pela
-- conta da HVAC. Se o selo virasse derivado sem isso, 12 obras perderiam a
-- marca que alguém colocou sabendo do que falava.
--
-- Então a marcação vira escopo, com source='legacy' para não se confundir com o
-- que veio do portal. Quando o export da Pulte existir, entra por cima como
-- 'portal' e este registro deixa de importar.
INSERT INTO forecast_site_companies (site_id, company, source)
SELECT DISTINCT c.site_id, 'hvac', 'legacy'
FROM forecast_core c
WHERE c.hvac
  AND c.site_id IS NOT NULL
  AND c.company <> 'hvac'
ON CONFLICT (site_id, company) DO NOTHING;
