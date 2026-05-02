-- Migration 297: Учёт возвратов сервисного сбора в platform_income
--
-- Контекст: при partial-refund (только тело билета) service_fee остаётся у
-- платформы — это бизнес-правило по умолчанию, и в акте АУ оно правильно
-- учтено. Но иногда мы вручную доплачиваем service_fee клиенту назад
-- (по жалобам, чтобы не потерять организатора как клиента). Тогда в БД нужна
-- запись `platform_income.income_type='service_fee_refund'` — иначе акт АУ
-- следующего периода учтёт service_fee как доход, а реально мы его уже вернули.
--
-- Миграция:
--   1. Уникальный индекс (payment_session_id, income_type) для refund-типов —
--      для идемпотентности (повторный webhook не должен задвоить запись).
--   2. SQL-функция record_service_fee_refund(session_id, reason, recorded_by) —
--      для ручных операций (выполнения суперадмином из консоли).

CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_income_session_refund
  ON public.platform_income (payment_session_id, income_type)
  WHERE income_type IN ('service_fee_refund', 'agent_commission_refund')
    AND payment_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_service_fee_refund(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session public.payment_sessions%ROWTYPE;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_session FROM public.payment_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_sessions not found: %', p_session_id;
  END IF;

  IF v_session.service_fee_amount IS NULL OR v_session.service_fee_amount <= 0 THEN
    RAISE EXCEPTION 'Session % has no service_fee_amount — nothing to refund', p_session_id;
  END IF;

  -- Идемпотентность: возвращаем существующий refund если он уже есть
  SELECT id INTO v_existing_id
  FROM public.platform_income
  WHERE payment_session_id = p_session_id AND income_type = 'service_fee_refund'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO public.platform_income (
    org_id, payment_session_id, event_registration_id, income_type,
    amount, currency, metadata
  ) VALUES (
    v_session.org_id,
    p_session_id,
    v_session.event_registration_id,
    'service_fee_refund',
    v_session.service_fee_amount,
    v_session.currency,
    jsonb_build_object(
      'reason', p_reason,
      'recorded_by', p_recorded_by,
      'recorded_at', NOW(),
      'session_paid_at', v_session.paid_at,
      'session_refunded_at', v_session.refunded_at
    )
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.record_service_fee_refund IS
  'Создаёт запись возврата сервисного сбора в platform_income. Идемпотентна (повторный вызов вернёт id уже существующей записи).';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 297: service_fee_refund infrastructure ready';
END $$;
