-- Migration 280: Отчёт о розничных продажах (ОРП) для сервисных сборов от физлиц
-- Date: 2026-04-15
-- Purpose:
--   Добавляет в accounting_documents новый тип 'service_fee_report' — сводный
--   документ Орбо о собственной выручке от сервисного сбора с физлиц-участников
--   за период. Для учёта в КУДиР и импорта в Эльбу.
--
--   Особенности документа:
--     - Нет контрагента-покупателя (розница): customer_requisites хранит маркер
--       «Розничные покупатели», ИНН/КПП пустые.
--     - Не привязан к конкретной организации платформы: org_id = NULL (один
--       документ покрывает все оплаты всех организаторов, т.к. это выручка Орбо).
--     - Период произвольный, задаётся оператором. Непересечение периодов
--       контролируется на уровне приложения (проверка по last_covered_until).

-- ═══════════════════════════════════════════════════════════════════
-- 1. Расширить CHECK на doc_type + разрешить NULL в org_id
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.accounting_documents
  DROP CONSTRAINT IF EXISTS accounting_documents_doc_type_check;

ALTER TABLE public.accounting_documents
  ADD CONSTRAINT accounting_documents_doc_type_check
  CHECK (doc_type IN ('subscription_act', 'agent_commission_upd', 'service_fee_report'));

ALTER TABLE public.accounting_documents
  ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN public.accounting_documents.org_id IS
  'Организация, к которой относится документ. NULL для документов Орбо без привязки к конкретной организации (например, ОРП).';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Последовательность ОРП-N и функция генерации номера
-- ═══════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS public.service_fee_report_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE public.service_fee_report_seq IS
  'Sequential number for retail sales reports (service fee). Format: ОРП-{seq}.';

CREATE OR REPLACE FUNCTION public.next_service_fee_report_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  v_next := nextval('public.service_fee_report_seq');
  RETURN 'ОРП-' || v_next;
END;
$$;

COMMENT ON FUNCTION public.next_service_fee_report_number IS
  'Returns next service fee report number in format ОРП-{seq}.';

-- ═══════════════════════════════════════════════════════════════════
-- 3. Индекс по периоду для service_fee_report
-- ═══════════════════════════════════════════════════════════════════

-- Уникальность периодов для service_fee_report строго не гарантируется (разные
-- отчёты за один и тот же период теоретически могут существовать — например,
-- корректирующие). Но для быстрого поиска последнего закрытого периода нужен индекс.
CREATE INDEX IF NOT EXISTS idx_accounting_documents_service_fee_report_period
  ON public.accounting_documents (period_end DESC)
  WHERE doc_type = 'service_fee_report';

DO $$ BEGIN RAISE NOTICE 'Migration 280 complete: service_fee_report doc type + ОРП-N sequence.'; END $$;
