-- Fix forecast_fieldwire rows where category still says "- House" (regular hyphen)
-- Migration 000017 used em dash and missed these
UPDATE forecast_fieldwire
SET category = REPLACE(category, ' - House', ' - Lot')
WHERE category LIKE '% - House';
