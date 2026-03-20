-- Migration 247: Fix billing plan descriptions and free plan consistency
-- The free plan description still said "1000" after migration 245 changed the limit to 500

UPDATE billing_plans
SET description = 'Для небольших сообществ до 500 участников'
WHERE code = 'free';

UPDATE billing_plans
SET description = 'Для клубов с платным членством и собственным брендом'
WHERE code = 'enterprise';
