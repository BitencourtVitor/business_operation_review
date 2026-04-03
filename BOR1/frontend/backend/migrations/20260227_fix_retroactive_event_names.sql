-- Script para padronizar os nomes dos eventos na tabela subcontractor_performance
-- Converte 'Retroactive Start (Open)' e 'Retroactive Start (Closed)' para 'not started -> open'
-- Converte 'Retroactive End (Closed)' para 'open -> closed'

UPDATE public.subcontractor_performance
SET event = 'not started -> open'
WHERE event IN ('Retroactive Start (Open)', 'Retroactive Start (Closed)');

UPDATE public.subcontractor_performance
SET event = 'open -> closed'
WHERE event = 'Retroactive End (Closed)';
