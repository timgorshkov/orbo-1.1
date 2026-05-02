-- Migration 298: флаг is_test для тестовых заявок на вывод
--
-- В платёжных шлюзах флаг is_test уже есть на payment_sessions; для платежей
-- на стороне платформы — на platform_income.metadata->>'is_test'. Заявки на
-- вывод (org_withdrawals) и связанные org_transactions могут быть тестовыми
-- (например, при отладке flow возврата средств организатору) — без флага они
-- проникают в реестры выводов и транзакций как реальные.
--
-- Решение:
--   • org_withdrawals.is_test boolean — отдельная колонка, по умолчанию false.
--   • org_transactions использует metadata jsonb, который уже есть; фильтрация
--     идёт по metadata->>'is_test'.

ALTER TABLE public.org_withdrawals
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_org_withdrawals_is_test
  ON public.org_withdrawals (is_test)
  WHERE is_test = true;

-- Одноразовый backfill: помечаем существующую тестовую заявку (10.04 / 11.04
-- на 2272.72 ₽) и связанные с ней транзакции (запрос/завершение).
UPDATE public.org_withdrawals
   SET is_test = true
 WHERE id = '7e51af1c-a192-4094-88e5-1b59820404da';

UPDATE public.org_transactions
   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{is_test}', 'true'::jsonb)
 WHERE id IN (
   SELECT requested_transaction_id FROM public.org_withdrawals WHERE is_test = true
   UNION
   SELECT completed_transaction_id FROM public.org_withdrawals WHERE is_test = true
 );

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 298: org_withdrawals.is_test added + 1 historical record marked';
END $$;
