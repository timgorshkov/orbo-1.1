-- Migration 281: Replace ОРП (service_fee_report) with Акт об оказании услуг (retail_act)
-- Date: 2026-04-16
-- Purpose:
--   Отказ от ОРП (форма КМ-6) в пользу классического акта об оказании услуг
--   на сводное физическое лицо «Розничные покупатели» с отправкой в Эльбу по API.
--   Реестр-расшифровка формируется на лету из metadata.payments при скачивании архива.
--
--   Контур.Эльба API штатно умеет создавать акты:
--     POST /v1/organizations/{orgId}/acts + POST .../contractors + POST .../document-links
--   поэтому отправляем акты напрямую. Старые ОРП удаляются вместе с файлами из S3
--   (отдельный application-level cleanup; здесь — только метаданные из БД).
--
-- Изменения:
--   1. Удалить все записи doc_type = 'service_fee_report' (в учёт не ушли, счётчик сбрасывается)
--   2. Обновить CHECK на doc_type: убрать 'service_fee_report', добавить 'retail_act'
--   3. Удалить sequence service_fee_report_seq и функцию next_service_fee_report_number
--   4. Создать sequence retail_act_seq и функцию next_retail_act_number (формат АУ-N)
--   5. Переименовать индекс по периоду на 'retail_act'
--   6. Добавить колонки для отслеживания синхронизации с Эльбой

-- ═══════════════════════════════════════════════════════════════════
-- 1. Снести все ОРП из accounting_documents
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM public.accounting_documents
 WHERE doc_type = 'service_fee_report';

-- ═══════════════════════════════════════════════════════════════════
-- 2. Обновить CHECK doc_type
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.accounting_documents
  DROP CONSTRAINT IF EXISTS accounting_documents_doc_type_check;

ALTER TABLE public.accounting_documents
  ADD CONSTRAINT accounting_documents_doc_type_check
  CHECK (doc_type IN ('subscription_act', 'agent_commission_upd', 'retail_act'));

COMMENT ON COLUMN public.accounting_documents.doc_type IS
  'subscription_act — АЛ-NNN, акт лицензии на тариф. '
  'agent_commission_upd — АВ-NNN, УПД на агентское вознаграждение. '
  'retail_act — АУ-NNN, акт об оказании услуг сводному физлицу «Розничные покупатели» (сервисный сбор).';

-- ═══════════════════════════════════════════════════════════════════
-- 3. Убрать старые артефакты ОРП
-- ═══════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_accounting_documents_service_fee_report_period;
DROP FUNCTION IF EXISTS public.next_service_fee_report_number();
DROP SEQUENCE IF EXISTS public.service_fee_report_seq;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Последовательность АУ-N и функция генерации номера
-- ═══════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS public.retail_act_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE public.retail_act_seq IS
  'Sequential number for retail service acts (сводный акт об оказании услуг на «Розничные покупатели»). Format: АУ-{seq}.';

CREATE OR REPLACE FUNCTION public.next_retail_act_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  v_next := nextval('public.retail_act_seq');
  RETURN 'АУ-' || v_next;
END;
$$;

COMMENT ON FUNCTION public.next_retail_act_number IS
  'Returns next retail act number in format АУ-{seq}.';

-- ═══════════════════════════════════════════════════════════════════
-- 5. Индекс по периоду для retail_act
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_accounting_documents_retail_act_period
  ON public.accounting_documents (period_end DESC)
  WHERE doc_type = 'retail_act';

-- ═══════════════════════════════════════════════════════════════════
-- 6. Колонки для отслеживания синхронизации с Эльбой
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.accounting_documents
  ADD COLUMN IF NOT EXISTS elba_document_id UUID,
  ADD COLUMN IF NOT EXISTS elba_url          TEXT,
  ADD COLUMN IF NOT EXISTS elba_sync_status  TEXT
      CHECK (elba_sync_status IS NULL OR elba_sync_status IN ('pending', 'synced', 'failed')),
  ADD COLUMN IF NOT EXISTS elba_synced_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS elba_error        TEXT;

COMMENT ON COLUMN public.accounting_documents.elba_document_id IS
  'UUID документа в Контур.Эльба (ответ POST /v1/organizations/{orgId}/acts).';
COMMENT ON COLUMN public.accounting_documents.elba_url IS
  'Публичная ссылка на документ в Эльбе (ответ POST /v1/organizations/{orgId}/document-links).';
COMMENT ON COLUMN public.accounting_documents.elba_sync_status IS
  'Статус синхронизации с Эльбой: pending (ожидает отправки), synced (успех), failed (ошибка).';
COMMENT ON COLUMN public.accounting_documents.elba_error IS
  'Текст ошибки от Эльбы при последней неудачной попытке (statusCode + сообщение).';

CREATE INDEX IF NOT EXISTS idx_accounting_documents_elba_sync
  ON public.accounting_documents (elba_sync_status)
  WHERE elba_sync_status IS NOT NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 281 complete: retail_act replaces service_fee_report + Elba sync columns.'; END $$;
