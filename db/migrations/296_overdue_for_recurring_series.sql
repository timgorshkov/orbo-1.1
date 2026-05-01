-- Migration 296: Не помечать оплаты на recurring-серии как overdue, пока серия активна
--
-- До этого момента и `mark_overdue_payments()` (мигр. 114), и cron-route
-- /api/cron/check-overdue-payments сравнивали `event_date - payment_deadline_days`
-- против CURRENT_DATE. Для регистрации на parent серии (`is_recurring=true,
-- parent_event_id IS NULL`) это event_date самого parent — обычно дата первого
-- инстанса. В результате участник, который регистрируется на серию длительностью
-- в полгода и платит после первого занятия, помечался как overdue после первого же
-- ивента — хотя по бизнес-логике у него есть время заплатить, пока серия активна.
--
-- Новая логика:
-- - Standalone event: как было — event_date - payment_deadline_days.
-- - Series parent: используем MAX(event_date) среди child instances. Если children
--   ещё не сгенерированы (только что создали серию) — никогда не overdue,
--   подождём пока не появится конкретная дата окончания.

CREATE OR REPLACE FUNCTION public.mark_overdue_payments()
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  updated_count INTEGER;
BEGIN
  WITH overdue_registrations AS (
    UPDATE event_registrations er
    SET
      payment_status = 'overdue',
      payment_updated_at = NOW()
    FROM events e
    WHERE er.event_id = e.id
      AND er.payment_status = 'pending'
      AND er.price IS NOT NULL
      AND er.price > 0
      AND (
        (
          CASE
            WHEN e.is_recurring AND e.parent_event_id IS NULL THEN
              -- Series parent: deadline считаем от последнего child instance.
              -- Если children нет (свеже созданная серия) — never overdue.
              COALESCE(
                (SELECT MAX(c.event_date) FROM events c WHERE c.parent_event_id = e.id),
                CURRENT_DATE + INTERVAL '999 days'
              )
            ELSE
              e.event_date
          END
        ) - INTERVAL '1 day' * COALESCE(e.payment_deadline_days, 3)
      ) < CURRENT_DATE
    RETURNING er.id
  )
  SELECT COUNT(*)::INTEGER INTO updated_count FROM overdue_registrations;

  RETURN updated_count;
END;
$function$;

-- Backfill: сбросить overdue → pending для регистраций на активные серии.
-- «Активная» серия = есть хотя бы один child с event_date >= CURRENT_DATE.
-- Это лечит существующие записи, помеченные старой логикой.
WITH reset AS (
  UPDATE event_registrations er
  SET payment_status = 'pending', payment_updated_at = NOW()
  FROM events e
  WHERE er.event_id = e.id
    AND er.payment_status = 'overdue'
    AND e.is_recurring
    AND e.parent_event_id IS NULL
    AND EXISTS (
      SELECT 1 FROM events c
      WHERE c.parent_event_id = e.id
        AND c.event_date >= CURRENT_DATE
    )
  RETURNING er.id
)
SELECT COUNT(*) AS reset_count FROM reset;

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 296: mark_overdue_payments() updated for recurring series + backfill';
END $$;
