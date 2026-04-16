-- Migration 282: per-organization Elba contractor mapping
-- Date: 2026-04-16
-- Purpose:
--   При автоматической выгрузке актов лицензии (АЛ) в Контур.Эльбу каждая
--   организация-клиент Orbo представлена в Эльбе отдельным контрагентом.
--   Первый раз контрагент создаётся через Elba API (POST .../contractors), его
--   UUID сохраняется здесь, чтобы при последующих актах использовать уже
--   существующую запись (идемпотентно).
--
--   Для ретейл-актов (АУ) используется фиксированный контрагент «Розничные
--   покупатели» и отдельная env-переменная ELBA_RETAIL_CONTRACTOR_ID — эта
--   таблица не затрагивается.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS elba_contractor_id UUID;

COMMENT ON COLUMN public.organizations.elba_contractor_id IS
  'UUID контрагента в Контур.Эльба (ответ POST /v1/organizations/{orgId}/contractors). Создаётся однократно при первой выгрузке АЛ и переиспользуется для всех последующих актов данной организации.';

-- Уникальность не обязательна (Elba сама предотвращает дубликаты по ИНН/КПП),
-- но индекс по колонке ускоряет поиск при resend.
CREATE INDEX IF NOT EXISTS idx_organizations_elba_contractor
  ON public.organizations (elba_contractor_id)
  WHERE elba_contractor_id IS NOT NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 282 complete: organizations.elba_contractor_id added.'; END $$;
